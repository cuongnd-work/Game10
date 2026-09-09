import { _decorator, Component, Node, Prefab, Vec3, instantiate, math } from 'cc';
import { SLIDE_CONFIG, SLIDE_RUNTIME, resetSlideRuntime } from 'db://assets/Src/Slide/SlideConfig';
import { Customer, CustomerState } from 'db://assets/Src/Slide/Customer';
import { SlideLevel } from 'db://assets/Src/Slide/SlideLevel';
import { SlideTrack } from 'db://assets/Src/Slide/SlideTrack';

const { ccclass, property } = _decorator;

/** Kết quả lấy khách khỏi hàng chờ – cần biết lấy từ hàng nào để reflow đúng hàng đó. */
interface DequeuedCustomer {
    customer: Customer;
    queueIndex: number;
}

/**
 * SlideField – điều phối hàng chờ 2 bên, số làn, level và vòng đời khách.
 * Pool khách tự quản (giống CarSpawner), không dùng object_pool của foundation.
 */
@ccclass('SlideField')
export class SlideField extends Component {
    @property([Prefab])
    customerPrefabs: Prefab[] = [];

    @property({ type: Node, tooltip: 'Parent của khách khi đang xếp hàng / trượt' })
    customerParent: Node = null!;

    @property({ type: Node, tooltip: 'Parent của khách sau khi qua cổng vòm (đổi z-order)' })
    exitCustomerParent: Node = null!;

    @property({ type: [Node], tooltip: 'Mỗi node = 1 hàng chờ; children = waypoint, child 0 = đầu hàng' })
    queueLanes: Node[] = [];

    @property({ type: [Node], tooltip: 'Điểm spawn của từng hàng chờ, cùng thứ tự với queueLanes' })
    queueSpawnPoints: Node[] = [];

    @property({
        type: SlideLevel,
        tooltip: 'Bộ làn trượt duy nhất của sân. Lv Up chỉ re-skin làn, không đổi node.',
    })
    layout: SlideLevel = null!;

    /** Khách vừa qua cổng vòm – GameManager dùng để cộng tiền + bắn coin effect. */
    onRideCompleted: ((worldPos: Vec3) => void) | null = null;
    /** Một khách bắt đầu trượt (dùng cho SFX). */
    onSlideStarted: (() => void) | null = null;

    private _queues: Customer[][] = [];
    private _live: Customer[] = [];
    private _pool: Node[] = [];
    private _nextQueue: number = 0;
    private _initialFilled: boolean = false;
    /** Cổng chặn lượt trượt: chỉ mở khi player bấm nút Slide lần đầu. */
    private _ridesStarted: boolean = false;

    protected onLoad(): void {
        // Scene reload không được giữ state cũ.
        resetSlideRuntime();
        this._queues = this.queueLanes.map(() => []);
        this.layout?.setActive(true);
        this.applyLevel();
        this.applyLaneCount();
    }

    protected start(): void {
        // Hàng chờ được lấp ngay để sân không trống, nhưng dispatch() còn bị
        // _ridesStarted chặn nên chưa ai leo lên platform.
        this.fillQueuesInstant();
        this.schedule(this.tick, SLIDE_CONFIG.CUSTOMER_SPAWN_INTERVAL);
        this.dispatch();
    }

    /**
     * Mở cổng cho khách bắt đầu trượt – SlideGameManager gọi khi player bấm
     * nút Slide lần đầu. Trước đó khách chỉ xếp hàng đứng chờ: playable phải
     * đứng yên tới khi player thực sự tương tác.
     */
    startRides(): void {
        if (this._ridesStarted) return;
        this._ridesStarted = true;
        this.dispatch();
    }

    // ── Điều khiển từ SlideGame ──────────────────────────────────

    /** Áp số làn mới; SlideGameManager phát Firework tại làn vừa bật. */
    setLaneCount(count: number): void {
        SLIDE_RUNTIME.laneCount = Math.max(1, count);
        this.applyLaneCount();
        this.dispatch();
    }

    /** Đổi level: đổi art của làn, giữ nguyên số làn, reset toàn bộ khách. */
    setLevel(level: number): void {
        SLIDE_RUNTIME.slideLevel = Math.max(1, level);
        this.applyLevel();
        this.applyLaneCount();
        this.resetAllCustomers();
    }

    /** Bật bubble "Speed" trên mọi khách đang có mặt. */
    playSpeedBubbleOnCustomers(): void {
        for (const customer of this._live) {
            customer.playSpeedBubble();
        }
    }

    /** Điểm đặt VFX của làn vừa được mở, theo thứ tự Lane_9 -> Lane_0. */
    getLaneUpgradeWorldPos(laneCount: number): Vec3 {
        const tracks = this.layout?.orderedTracks() ?? [];
        const added = tracks[Math.max(0, Math.min(tracks.length - 1, laneCount - 1))];
        return added?.getUpgradeEffectWorldPos() ?? this.node.worldPosition.clone();
    }

    /** Vị trí VFX của tất cả làn đang mở, theo thứ tự Lane_9 -> Lane_0. */
    getActiveLaneUpgradeWorldPositions(): Vec3[] {
        return this.activeTracks().map((track) => track.getUpgradeEffectWorldPos());
    }

    /**
     * Lv Up: xoá sạch khách, lấp lại hàng chờ, đưa khách lên mọi platform rồi
     * cho trượt ĐỒNG LOẠT trong cùng một frame (theo spec mục 4.3).
     */
    resetAllCustomers(): void {
        this.recycleAllCustomers();
        this.fillQueuesInstant();
        if (!this._ridesStarted) return;

        const pending: Array<{ track: SlideTrack; customer: Customer }> = [];
        for (const track of this.activeTracks()) {
            const picked = this.takeFrontCustomer(track);
            if (!picked) break;
            track.assign(picked.customer);
            picked.customer.snapToPlatform(track.getPlatformWorldPos());
            pending.push({ track, customer: picked.customer });
        }

        this.reflowAllQueues();
        for (const item of pending) {
            this.launchSlide(item.track, item.customer);
        }
    }

    // ── Vòng lặp ─────────────────────────────────────────────────

    private tick = (): void => {
        this.dispatch();
        this.refillQueues();
    };

    /** Mỗi làn rảnh sẽ kéo 1 khách từ đầu hàng lên platform. */
    private dispatch(): void {
        if (!this._ridesStarted) return;

        for (const track of this.activeTracks()) {
            if (!track.isFree) continue;

            const picked = this.takeFrontCustomer(track);
            if (!picked) return;

            const customer = picked.customer;
            track.assign(customer);
            customer.climbToPlatform(
                track.getPlatformWorldPos(),
                () => this.launchSlide(track, customer),
            );
            this.reflowQueue(picked.queueIndex);
        }
    }

    private launchSlide(track: SlideTrack, customer: Customer): void {
        // Đẩy khách vào riderSlot của làn TRƯỚC khi tạo tween: khách phải nằm
        // giữa sprite thân ống và sprite thành trước thì mới trông như đang
        // trượt bên trong ống. startSlide() quy đổi waypoint theo parent mới.
        customer.reparentTo(track.riderSlot);

        customer.startSlide(
            track.getSlidePathWorld(),
            track.slideEndSpeedRatio,
            (worldPos) => {
                track.playSplashEffect();
                this.onRideCompleted?.(worldPos);
            },
            () => {
                // Làn được giải phóng ngay khi khách qua cổng vòm – khách kế
                // tiếp leo lên trong lúc khách này còn đang ngâm hồ.
                track.free();
                customer.enterPool(this.pickPoolSpot(customer.node.worldPosition));
                this.dispatch();
            },
        );
    }

    /**
     * Điểm khách trôi tới trong hồ = cổng vòm + pháp tuyến vào lòng hồ * độ sâu
     * ngẫu nhiên (+ chút lệch dọc mặt nước). Cổng vòm của MỌI làn đều nằm trên
     * cạnh mặt nước vì node Pool đã đặt khớp hàng cổng vòm, nên không cần wire
     * thêm điểm neo cho từng làn. Độ sâu ngẫu nhiên để nhiều khách cùng lúc
     * không nổi chồng lên nhau.
     */
    private pickPoolSpot(archWorld: Vec3): Vec3 {
        const dir = new Vec3(SLIDE_CONFIG.POOL_DRIFT_DIR_X, SLIDE_CONFIG.POOL_DRIFT_DIR_Y, 0).normalize();
        // Tiếp tuyến mặt nước = pháp tuyến quay 90 độ.
        const side = new Vec3(-dir.y, dir.x, 0);
        const depth = math.randomRange(SLIDE_CONFIG.POOL_DRIFT_DEPTH_MIN, SLIDE_CONFIG.POOL_DRIFT_DEPTH_MAX);
        const spread = SLIDE_CONFIG.POOL_DRIFT_SIDE_SPREAD;
        const lateral = math.randomRange(-spread, spread);

        return new Vec3(
            archWorld.x + dir.x * depth + side.x * lateral,
            archWorld.y + dir.y * depth + side.y * lateral,
            archWorld.z,
        );
    }

    // ── Hàng chờ ─────────────────────────────────────────────────

    private fillQueuesInstant(): void {
        this._initialFilled = false;
        for (let lane = 0; lane < this.queueLanes.length; lane++) {
            const capacity = this.getQueueWaypoints(lane).length;
            while (this._queues[lane].length < capacity) {
                if (!this.spawnIntoQueue(lane)) break;
            }
        }
        this._initialFilled = true;
    }

    private refillQueues(): void {
        for (let lane = 0; lane < this.queueLanes.length; lane++) {
            const capacity = this.getQueueWaypoints(lane).length;
            if (this._queues[lane].length >= capacity) continue;
            this.spawnIntoQueue(lane);
        }
    }

    /** Trả về false nếu không spawn được (thiếu waypoint / thiếu prefab). */
    private spawnIntoQueue(lane: number): boolean {
        const waypoints = this.getQueueWaypoints(lane);
        if (waypoints.length === 0) return false;
        if (this._queues[lane].length >= waypoints.length) return false;
        if (this.customerPrefabs.length === 0) {
            console.error('[SlideField] customerPrefabs chua duoc gan!');
            return false;
        }

        const node = this.acquireCustomerNode();
        node.parent = this.customerParent ?? this.node;

        const customer = node.getComponent(Customer)!;
        customer.resetForPool();
        customer.randomizeSkin();
        customer.exitParent = this.exitCustomerParent ?? null;
        customer.onRecycle = () => this.recycle(customer);
        customer.onSlideStart = () => this.onSlideStarted?.();

        this._queues[lane].push(customer);
        this._live.push(customer);

        const targetIndex = this._queues[lane].length - 1;
        const worldWaypoints = waypoints.map((n) => n.worldPosition.clone());

        if (!this._initialFilled) {
            // Lấp hàng lần đầu / sau Lv Up: khách hiện thẳng tại chỗ, không đi vào.
            node.worldPosition = worldWaypoints[targetIndex].clone();
            customer.snapToQueue(worldWaypoints[targetIndex], targetIndex);
            return true;
        }

        const spawnPoint = this.queueSpawnPoints[lane];
        const spawnPos = spawnPoint
            ? spawnPoint.worldPosition.clone()
            : worldWaypoints[worldWaypoints.length - 1].clone();
        node.worldPosition = spawnPos;
        customer.setQueueIndex(worldWaypoints.length);
        customer.moveAlongQueue(worldWaypoints, targetIndex);
        return true;
    }

    /**
     * Lấy khách đầu hàng cho `track`: ưu tiên hàng chờ có đầu hàng GẦN platform
     * của làn đó nhất. Làn mở dần từ phải sang trái, nên nếu luân phiên 2 bên
     * như trước thì khách hàng bên trái phải đi vòng hết sân để tới làn ngoài
     * cùng bên phải. Khi 2 hàng cách đều nhau thì `_nextQueue` vẫn khiến lượt
     * lấy xoay vòng, nhờ vậy hàng chờ 2 bên tiêu thụ đều.
     *
     * `track` = null → không có mốc để so, quay về luân phiên thuần.
     */
    private takeFrontCustomer(track: SlideTrack | null): DequeuedCustomer | null {
        const laneCount = this._queues.length;
        if (laneCount === 0) return null;

        const target = track ? track.getPlatformWorldPos() : null;
        let bestLane = -1;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (let step = 0; step < laneCount; step++) {
            const lane = (this._nextQueue + step) % laneCount;
            const front = this._queues[lane][0];
            if (!front) continue;
            // Chỉ lấy khách đã đứng yên ở đầu hàng – tránh cắt ngang tween đang chạy.
            if (front.state !== CustomerState.QUEUING) continue;

            if (!target) {
                bestLane = lane;
                break;
            }

            const distance = Vec3.distance(front.node.worldPosition, target);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestLane = lane;
            }
        }
        if (bestLane < 0) return null;

        const customer = this._queues[bestLane].shift()!;
        this._nextQueue = (bestLane + 1) % laneCount;
        return { customer, queueIndex: bestLane };
    }

    private reflowQueue(lane: number): void {
        const waypoints = this.getQueueWaypoints(lane).map((n) => n.worldPosition.clone());
        const queue = this._queues[lane];
        for (let i = 0; i < queue.length; i++) {
            queue[i].moveAlongQueue(waypoints, i);
        }
    }

    private reflowAllQueues(): void {
        for (let lane = 0; lane < this._queues.length; lane++) {
            this.reflowQueue(lane);
        }
    }

    private getQueueWaypoints(lane: number): Node[] {
        const laneNode = this.queueLanes[lane];
        if (!laneNode) return [];
        return laneNode.children.filter((child) => child.active);
    }

    // ── Làn / level ──────────────────────────────────────────────

    private currentLayout(): SlideLevel | null {
        return this.layout ?? null;
    }

    private activeTracks(): SlideTrack[] {
        return this.currentLayout()?.activeTracks() ?? [];
    }

    /**
     * Áp art của level hiện tại lên bộ làn. Không còn bật/tắt node level nào:
     * cả 3 level dùng chung node Slides, chỉ khác spriteFrame body/rail và mái
     * kính (xem SlideTrack.applyLevel).
     */
    private applyLevel(): void {
        this.layout?.applyLevel(SLIDE_RUNTIME.slideLevel);
    }

    private applyLaneCount(): void {
        const layout = this.currentLayout();
        if (!layout) return;

        const tracks = layout.orderedTracks();
        for (let index = 0; index < tracks.length; index++) {
            tracks[index].setActive(index < SLIDE_RUNTIME.laneCount);
        }
    }

    // ── Pool ─────────────────────────────────────────────────────

    private acquireCustomerNode(): Node {
        if (this._pool.length > 0) {
            const node = this._pool.pop()!;
            node.active = true;
            return node;
        }
        const prefab = this.customerPrefabs[
            Math.floor(Math.random() * this.customerPrefabs.length)
        ];
        return instantiate(prefab);
    }

    private recycle(customer: Customer): void {
        customer.resetForPool();
        customer.onRecycle = null;

        const liveIndex = this._live.indexOf(customer);
        if (liveIndex >= 0) this._live.splice(liveIndex, 1);
        for (const queue of this._queues) {
            const index = queue.indexOf(customer);
            if (index >= 0) queue.splice(index, 1);
        }

        const node = customer.node;
        node.active = false;
        node.parent = this.node;
        this._pool.push(node);
    }

    private recycleAllCustomers(): void {
        this.currentLayout()?.freeAllTracks();
        // clone vì recycle() mutate _live
        for (const customer of this._live.slice()) {
            this.recycle(customer);
        }
        this._live.length = 0;
        for (const queue of this._queues) queue.length = 0;
    }
}
