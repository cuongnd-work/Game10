import { _decorator, CCString, Component, Node, Tween, tween, UIOpacity, Vec3, sp } from 'cc';
import { SLIDE_CONFIG, SLIDE_RUNTIME } from 'db://assets/Src/Slide/SlideConfig';

const { ccclass, property } = _decorator;

export enum CustomerState {
    /** Đang đi dọc waypoint của hàng chờ để về đúng chỗ. */
    QUEUE_MOVING = 'QUEUE_MOVING',
    /** Đứng yên trong hàng chờ. */
    QUEUING = 'QUEUING',
    /** Đang leo từ đầu hàng lên platform trên đỉnh cầu trượt. */
    CLIMBING = 'CLIMBING',
    /** Đứng trên platform, chờ lệnh trượt (Lv Up cần trạng thái này để đồng loạt xuất phát). */
    READY = 'READY',
    /** Đang trượt xuống. */
    SLIDING = 'SLIDING',
    /** Đã qua cổng vòm, đang nổi trong hồ bơi chờ biến mất. */
    IN_POOL = 'IN_POOL',
    /** Đã qua cổng vòm, đang rời sân. */
    EXITING = 'EXITING',
}

/**
 * Customer – 1 vị khách. State machine chạy hoàn toàn bằng tween chain,
 * KHÔNG dùng update() (giữ đúng pattern của Car.ts trong game cũ).
 *
 * Thời gian trượt đọc SLIDE_RUNTIME.slideDuration ngay tại lúc bắt đầu trượt,
 * nên khách đang xếp hàng lúc player upgrade speed vẫn hưởng speed mới.
 */
@ccclass('Customer')
export class Customer extends Component {
    /** Tốc độ ở chân cầu so với lúc vừa vào máng. */
    private static readonly SLIDE_END_SPEED_RATIO = 2.4;

    /** Node chứa toàn bộ hình ảnh (để flip / scale). Bỏ trống = dùng chính node này. */
    @property(Node)
    visualRoot: Node = null!;

    /** Spine (optional – chưa có art vẫn chạy được). */
    @property(sp.Skeleton)
    skeleton: sp.Skeleton = null!;

    @property
    idleAnimName: string = 'Front_Idle';

    @property
    walkAnimName: string = 'Front_Run';

    @property
    slideAnimName: string = 'Front_Slide';

    @property({ tooltip: 'Anim khi nổi trong hồ. Bỏ trống = dùng lại slideAnimName (spine chưa có anim bơi riêng).' })
    poolAnimName: string = '';

    @property({ type: [CCString], tooltip: 'Danh sách skin của spine; mỗi lần lấy khách khỏi pool sẽ bốc ngẫu nhiên 1 skin' })
    skins: string[] = [];

    @property({ tooltip: 'Lật visual theo trục X khi di chuyển sang trái' })
    flipWhenMovingLeft: boolean = true;

    /** Bubble chữ "Speed" bật khi player upgrade speed. */
    @property(Node)
    speedBubble: Node = null!;

    /** Parent để reparent khi rời cổng vòm (đổi z-order). Do SlideField gán. */
    exitParent: Node | null = null;

    onRecycle: (() => void) | null = null;
    onSlideStart: (() => void) | null = null;

    private _state: CustomerState = CustomerState.QUEUING;
    private _moveTween: Tween<Node> | null = null;
    private _queueIndex: number = -1;
    private _visualBaseScale: Vec3 = new Vec3(1, 1, 1);
    private _visualBaseLocalPos: Vec3 = new Vec3();
    private _visualBaseEulerZ: number = 0;
    private _poolBobbing: boolean = false;
    private _speedBubbleBaseScale: Vec3 | null = null;
    private _speedBubbleBaseLocalPos: Vec3 | null = null;

    get state(): CustomerState { return this._state; }
    get queueIndex(): number { return this._queueIndex; }

    protected onLoad(): void {
        this.visualRoot = this.visualRoot ?? this.skeleton?.node ?? this.node;
        this._visualBaseScale = this.visualRoot.scale.clone();
        this._visualBaseLocalPos = this.visualRoot.position.clone();
        this._visualBaseEulerZ = this.visualRoot.eulerAngles.z;
        if (this.speedBubble) this.speedBubble.active = false;
    }

    // ── Hàng chờ ─────────────────────────────────────────────────

    setQueueIndex(index: number): void {
        this._queueIndex = index;
    }

    /** Đặt thẳng khách vào 1 waypoint, không tween (dùng khi lấp hàng chờ lần đầu). */
    snapToQueue(worldPos: Vec3, index: number): void {
        this.stopMoveTween();
        this.node.worldPosition = worldPos.clone();
        this._queueIndex = index;
        this.setState(CustomerState.QUEUING);
        this.playAnim(this.idleAnimName);
    }

    /**
     * Đi dọc hàng chờ từ vị trí hiện tại tới waypoint `targetIndex`.
     * Waypoint index 0 = đầu hàng (gần cầu trượt nhất).
     */
    moveAlongQueue(waypointsWorld: Vec3[], targetIndex: number): void {
        this.stopMoveTween();

        const path = this.buildQueuePathIndices(waypointsWorld.length, targetIndex);
        if (path.length === 0) {
            this._queueIndex = targetIndex;
            this.setState(CustomerState.QUEUING);
            this.playAnim(this.idleAnimName);
            return;
        }

        this.setState(CustomerState.QUEUE_MOVING);
        this.playAnim(this.walkAnimName);

        let chain = tween(this.node);
        for (const index of path) {
            const waypoint = waypointsWorld[index];
            chain = chain
                .call(() => this.applyFacing(waypoint))
                .to(
                    SLIDE_CONFIG.QUEUE_SEGMENT_DURATION,
                    { position: this.worldToParentLocal(waypoint) },
                    { easing: 'linear' },
                )
                .call(() => { this._queueIndex = index; });
        }

        this._moveTween = chain
            .call(() => {
                this.setState(CustomerState.QUEUING);
                this.playAnim(this.idleAnimName);
            })
            .start();
    }

    // ── Lên platform ─────────────────────────────────────────────

    /** Leo từ đầu hàng lên platform đỉnh cầu trượt. */
    climbToPlatform(platformWorld: Vec3, onArrived?: () => void): void {
        this.stopMoveTween();
        this.setState(CustomerState.CLIMBING);
        this.playAnim(this.walkAnimName);
        this.applyFacing(platformWorld);

        this._moveTween = tween(this.node)
            .to(
                SLIDE_CONFIG.CLIMB_DURATION,
                { position: this.worldToParentLocal(platformWorld) },
                { easing: 'sineInOut' },
            )
            .call(() => {
                this.setState(CustomerState.READY);
                this.playAnim(this.idleAnimName);
                onArrived?.();
            })
            .start();
    }

    /** Đặt thẳng lên platform, không tween – dùng khi Lv Up reset toàn bộ khách. */
    snapToPlatform(platformWorld: Vec3): void {
        this.stopMoveTween();
        this.node.worldPosition = platformWorld.clone();
        this.setState(CustomerState.READY);
        this.playAnim(this.idleAnimName);
    }

    // ── Trượt ────────────────────────────────────────────────────

    /**
     * Trượt theo `pathWorld` (waypoint cuối cùng = cổng vòm).
     * Tổng thời gian = SLIDE_RUNTIME.slideDuration. Thời gian từng đoạn được
     * tính theo gia tốc đều để khách tăng tốc tự nhiên khi xuống dốc.
     */
    startSlide(
        pathWorld: Vec3[],
        onReachedArch: (worldPos: Vec3) => void,
        onFinished: () => void,
    ): void {
        this.stopMoveTween();

        if (pathWorld.length === 0) {
            const here = this.node.worldPosition.clone();
            this.setState(CustomerState.EXITING);
            onReachedArch(here);
            onFinished();
            return;
        }

        this.setState(CustomerState.SLIDING);
        this.playAnim(this.slideAnimName);
        // Slide art dùng animation nhìn chính diện (Front_Slide). Không lật trái/phải
        // theo từng waypoint vì đường ống đi chéo sẽ làm nhân vật đổi hướng giữa máng.
        if (this.visualRoot) {
            this.visualRoot.setScale(this._visualBaseScale);
        }
        this.onSlideStart?.();

        const total = Math.max(0.05, SLIDE_RUNTIME.slideDuration);
        const durations = this.splitDurationByAcceleration(pathWorld, total);

        let chain = tween(this.node);
        for (let i = 0; i < pathWorld.length; i++) {
            const waypoint = pathWorld[i];
            chain = chain
                .call(() => this.applySlideLean(waypoint))
                .to(
                    durations[i],
                    { position: this.worldToParentLocal(waypoint) },
                    { easing: 'linear' },
                );
        }

        this._moveTween = chain
            .call(() => {
                this.resetSlideLean();
                const archPos = this.node.worldPosition.clone();
                this.setState(CustomerState.EXITING);
                onReachedArch(archPos);
                onFinished();
            })
            .start();
    }

    /**
     * Đi theo đường thoát rồi tự recycle.
     *
     * KHÔNG còn nằm trên luồng chạy: SlideField hiện gọi `enterPool()` sau khi
     * khách qua cổng vòm. Giữ lại (cùng `exitPath` của SlideTrack) để đổi lại
     * kiểu thoát cũ mà không phải wire lại scene.
     */
    exitAlong(pathWorld: Vec3[]): void {
        this.stopMoveTween();
        this.reparentForExit();
        this.setState(CustomerState.EXITING);
        this.playAnim(this.walkAnimName);

        if (pathWorld.length === 0) {
            this.onRecycle?.();
            return;
        }

        let chain = tween(this.node);
        for (const waypoint of pathWorld) {
            chain = chain
                .call(() => this.applyFacing(waypoint))
                .to(
                    SLIDE_CONFIG.EXIT_SEGMENT_DURATION,
                    { position: this.worldToParentLocal(waypoint) },
                    { easing: 'linear' },
                );
        }

        this._moveTween = chain
            .call(() => { this.onRecycle?.(); })
            .start();
    }

    // ── Hồ bơi ───────────────────────────────────────────────────

    /**
     * Xuống hồ sau khi qua cổng vòm: trôi vào lòng hồ, nổi nhấp nhô đúng
     * POOL_STAY_DURATION giây rồi mờ dần và trả về pool object.
     *
     * Thay cho `exitAlong()` – khách không đi bộ ra khỏi sân nữa. Vẫn reparent
     * sang `exitParent` để nổi TRÊN mặt nước (node ExitCustomers nằm sau node
     * Pool trong GameLayer nên render sau).
     */
    enterPool(targetWorld: Vec3): void {
        this.stopMoveTween();
        this.reparentForExit();
        this.setState(CustomerState.IN_POOL);
        this.playAnim(this.poolAnimName || this.slideAnimName);

        const opacity = this.ensureOpacity();
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;

        this.applyFacing(targetWorld);

        const drift = Math.max(0.01, SLIDE_CONFIG.POOL_DRIFT_DURATION);
        const soak = Math.max(0, SLIDE_CONFIG.POOL_STAY_DURATION - drift);

        this._moveTween = tween(this.node)
            .to(drift, { position: this.worldToParentLocal(targetWorld) }, { easing: 'sineOut' })
            .call(() => this.startPoolBob())
            .delay(soak)
            .call(() => {
                this.stopPoolBob();
                tween(opacity)
                    .to(SLIDE_CONFIG.POOL_FADE_DURATION, { opacity: 0 }, { easing: 'quadIn' })
                    .call(() => { this.onRecycle?.(); })
                    .start();
            })
            .start();
    }

    /** Nhấp nhô lên/xuống cho giống đang nổi trên nước. */
    private startPoolBob(): void {
        const visual = this.visualRoot;
        if (!visual || visual === this.node) return;

        Tween.stopAllByTarget(visual);
        visual.setPosition(this._visualBaseLocalPos);
        this._poolBobbing = true;

        const base = this._visualBaseLocalPos;
        const up = new Vec3(base.x, base.y + SLIDE_CONFIG.POOL_BOB_AMPLITUDE, base.z);
        const half = Math.max(0.05, SLIDE_CONFIG.POOL_BOB_DURATION * 0.5);

        tween(visual)
            .repeatForever(
                tween(visual)
                    .to(half, { position: up }, { easing: 'sineInOut' })
                    .to(half, { position: base.clone() }, { easing: 'sineInOut' }),
            )
            .start();
    }

    private stopPoolBob(): void {
        if (!this._poolBobbing) return;
        this._poolBobbing = false;
        const visual = this.visualRoot;
        if (!visual) return;
        Tween.stopAllByTarget(visual);
        visual.setPosition(this._visualBaseLocalPos);
    }

    private ensureOpacity(): UIOpacity {
        return this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    }

    // ── VFX ──────────────────────────────────────────────────────

    /** Bubble "Speed" nảy lên đầu khách khi upgrade speed (port từ Attendant). */
    playSpeedBubble(): void {
        const node = this.speedBubble;
        if (!node) return;

        if (!this._speedBubbleBaseScale) this._speedBubbleBaseScale = node.scale.clone();
        if (!this._speedBubbleBaseLocalPos) this._speedBubbleBaseLocalPos = node.position.clone();

        const baseScale = this._speedBubbleBaseScale.clone();
        const baseLocal = this._speedBubbleBaseLocalPos.clone();
        const risenLocal = new Vec3(baseLocal.x, baseLocal.y + 70, baseLocal.z);
        const bigScale = new Vec3(baseScale.x * 1.3, baseScale.y * 1.3, baseScale.z);
        const startScale = new Vec3(baseScale.x * 0.6, baseScale.y * 0.6, baseScale.z);

        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);

        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(opacity);

        node.setPosition(baseLocal);
        node.setScale(startScale);
        opacity.opacity = 255;
        node.active = true;

        tween(node)
            .to(0.15, { scale: bigScale }, { easing: 'backOut' })
            .to(0.15, { scale: baseScale }, { easing: 'quadIn' })
            .start();

        tween(node)
            .delay(0.1)
            .to(0.6, { position: risenLocal }, { easing: 'sineOut' })
            .start();

        tween(opacity)
            .delay(0.35)
            .to(0.35, { opacity: 0 }, { easing: 'quadIn' })
            .call(() => {
                node.active = false;
                node.setPosition(baseLocal);
                node.setScale(baseScale);
                opacity.opacity = 255;
            })
            .start();
    }

    // ── Pool ─────────────────────────────────────────────────────

    /**
     * Chuyển node sang parent khác nhưng GIỮ NGUYÊN vị trí thế giới. Dùng để
     * xếp khách vào đúng lớp render (riderSlot của làn khi trượt, exitParent
     * khi rời cổng vòm). Phải gọi trước khi tạo tween vì tween chạy trên toạ độ
     * local của parent.
     */
    reparentTo(parent: Node | null): void {
        if (!parent || this.node.parent === parent) return;
        const worldPos = this.node.worldPosition.clone();
        this.node.setParent(parent, true);
        this.node.worldPosition = worldPos;
    }

    /**
     * Đổi sang 1 skin ngẫu nhiên trong `skins`. Nhờ vậy chỉ cần 1 prefab là ra
     * đủ 6 kiểu khách (Nam_1..3 / Nu_1..3) mà không phải nhân bản prefab.
     */
    randomizeSkin(): void {
        if (!this.skeleton || this.skins.length === 0) return;
        const name = this.skins[Math.floor(Math.random() * this.skins.length)];
        if (name) this.skeleton.setSkin(name);
    }

    /** Dọn sạch trước khi trả về pool / khi Lv Up reset toàn bộ. */
    resetForPool(): void {
        this.stopMoveTween();
        this.unscheduleAllCallbacks();
        Tween.stopAllByTarget(this.node);
        this._queueIndex = -1;
        this._state = CustomerState.QUEUING;
        this.onSlideStart = null;
        if (this.speedBubble) {
            Tween.stopAllByTarget(this.speedBubble);
            this.speedBubble.active = false;
        }
        // Khách vừa ở trong hồ có thể đang nhấp nhô + đang mờ dần: phải dọn cả
        // tween trên visualRoot và UIOpacity, nếu không lượt tái sử dụng sau sẽ
        // hiện ra trong suốt hoặc lệch vị trí.
        this.stopPoolBob();
        if (this.visualRoot) this.visualRoot.setScale(this._visualBaseScale);
        this.resetSlideLean();
        const opacity = this.node.getComponent(UIOpacity);
        if (opacity) {
            Tween.stopAllByTarget(opacity);
            opacity.opacity = 255;
        }
    }

    protected onDestroy(): void {
        this.stopMoveTween();
        this.stopPoolBob();
        this.unscheduleAllCallbacks();
    }

    // ── Internal ─────────────────────────────────────────────────

    private setState(next: CustomerState): void {
        this._state = next;
    }

    private stopMoveTween(): void {
        if (this._moveTween) {
            this._moveTween.stop();
            this._moveTween = null;
        }
    }

    private reparentForExit(): void {
        this.reparentTo(this.exitParent);
    }

    /**
     * Danh sách index waypoint cần đi qua để tới `targetIndex`.
     * Khách chỉ tiến lên (index giảm dần về 0) nên path luôn liên tục.
     */
    private buildQueuePathIndices(count: number, targetIndex: number): number[] {
        if (count === 0) return [];
        const path: number[] = [];
        if (this._queueIndex > targetIndex) {
            for (let i = this._queueIndex - 1; i >= targetIndex; i--) path.push(i);
        } else if (this._queueIndex < targetIndex) {
            for (let i = this._queueIndex + 1; i <= targetIndex; i++) path.push(i);
        }
        return path;
    }

    /**
     * Chia thời gian theo chuyển động gia tốc đều dọc toàn quỹ đạo.
     * Dùng mốc thời gian tích lũy để gia tốc không bị reset tại waypoint.
     */
    private splitDurationByAcceleration(pathWorld: Vec3[], total: number): number[] {
        const from = this.node.worldPosition.clone();
        const lengths: number[] = [];
        let prev = from;
        let sum = 0;
        for (const waypoint of pathWorld) {
            const len = Vec3.distance(prev, waypoint);
            lengths.push(len);
            sum += len;
            prev = waypoint;
        }
        if (sum <= 0.0001) {
            const even = total / pathWorld.length;
            return pathWorld.map(() => Math.max(0.01, even));
        }
        const startSpeed = 1;
        const endSpeed = Customer.SLIDE_END_SPEED_RATIO;
        const speedSquaredDelta = endSpeed * endSpeed - startSpeed * startSpeed;
        const durationScale = total / (endSpeed - startSpeed);
        const durations: number[] = [];
        let travelled = 0;
        let previousTime = 0;
        for (const len of lengths) {
            travelled += len;
            const progress = Math.min(1, travelled / sum);
            const speed = Math.sqrt(startSpeed * startSpeed + speedSquaredDelta * progress);
            const currentTime = (speed - startSpeed) * durationScale;
            durations.push(Math.max(0.01, currentTime - previousTime));
            previousTime = currentTime;
        }
        return durations;
    }

    private applyFacing(targetWorldPos: Vec3): void {
        if (!this.flipWhenMovingLeft || !this.visualRoot) return;
        const dx = targetWorldPos.x - this.node.worldPosition.x;
        if (Math.abs(dx) < 0.001) return;
        const scale = this._visualBaseScale.clone();
        scale.x = Math.abs(scale.x) * (dx < 0 ? -1 : 1);
        this.visualRoot.setScale(scale);
    }

    /** Nghiêng nhẹ theo tiếp tuyến khúc cua, không lật animation Front_Slide. */
    private applySlideLean(targetWorldPos: Vec3): void {
        if (!this.visualRoot) return;
        const dx = targetWorldPos.x - this.node.worldPosition.x;
        const dy = Math.max(1, Math.abs(targetWorldPos.y - this.node.worldPosition.y));
        const lean = Math.max(-9, Math.min(9, (dx / dy) * 18));
        this.visualRoot.setRotationFromEuler(0, 0, this._visualBaseEulerZ - lean);
    }

    private resetSlideLean(): void {
        this.visualRoot?.setRotationFromEuler(0, 0, this._visualBaseEulerZ);
    }

    private playAnim(name: string): void {
        if (!this.skeleton || !name) return;
        this.skeleton.timeScale = 1;
        this.skeleton.setAnimation(0, name, true);
    }

    private worldToParentLocal(worldPos: Vec3): Vec3 {
        const local = new Vec3();
        const parent = this.node.parent;
        if (parent) parent.inverseTransformPoint(local, worldPos);
        else Vec3.copy(local, worldPos);
        return local;
    }
}
