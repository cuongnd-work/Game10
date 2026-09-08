import { _decorator, Component, Node, Prefab, instantiate, Vec3 } from 'cc';
import { GAME_CONFIG } from 'db://assets/Src/Core/GameConfig';
import { GasStation } from 'db://assets/Src/Gameplay/GasStation';
import { Car, CarState } from 'db://assets/Src/Gameplay/Car';

const { ccclass, property } = _decorator;

@ccclass('CarSpawner')
export class CarSpawner extends Component {
    @property([Prefab])
    carPrefabs: Prefab[] = [];

    @property(GasStation)
    gasStation: GasStation = null!;

    @property(Node)
    carParent: Node = null!;

    @property(Node)
    exitCarParent: Node = null!;

    /** Parent cho xe khi bắt đầu drive vào slot (đổi z-order / grouping). */
    @property(Node)
    slotCarParent: Node = null!;

    @property(Node)
    queueLane: Node = null!;

    @property(Node)
    spawnPoint: Node = null!;

    @property
    maxHornCars: number = 2;

    onCarRefueled: ((carWorldPos: Vec3, slotIndex: number) => void) | null = null;
    onCarRefuelStart: (() => void) | null = null;
    onCarQueueBubble: (() => void) | null = null;
    onInitialQueueReady: (() => void) | null = null;

    private _pool: Node[] = [];
    private _queue: Car[] = [];
    private _initialQueueReady: boolean = false;
    private _paused: boolean = false;

    protected start(): void {
        // Initial queue được lấp đầy ngay tại start – không delay giữa các xe.
        // Delay CAR_SPAWN_INTERVAL chỉ áp dụng cho các xe drive-in sau này.
        this.fillInitialQueue();
        this.schedule(this.tick, GAME_CONFIG.CAR_SPAWN_INTERVAL);
    }

    private fillInitialQueue(): void {
        while (!this._initialQueueReady) {
            const before = this._queue.length;
            this.trySpawnAtBack();
            if (this._queue.length === before) break; // không có waypoint hoặc không spawn được
        }
    }

    setPaused(paused: boolean): void {
        this._paused = paused;
    }

    isPaused(): boolean {
        return this._paused;
    }

    private tick = (): void => {
        if (this._paused) return;
        this.tryDispatchFrontCar();
        this.trySpawnAtBack();
    };

    private getQueueWaypoints(): Node[] {
        if (!this.queueLane) return [];
        return this.queueLane.children.filter((node) => node.active);
    }

    private tryDispatchFrontCar(): void {
        if (this._queue.length === 0) return;

        const front = this._queue[0];
        if (front.state !== CarState.QUEUING) return;

        const slot = this.gasStation?.getFreeSlotForCar();
        if (!slot) return;

        this._queue.shift();
        slot.assignCar(front);
        front.slot = slot;
        front.startDriveIn();

        this.reflowQueue();
    }

    private trySpawnAtBack(): void {
        const waypoints = this.getQueueWaypoints();
        if (waypoints.length === 0) return;
        if (this._queue.length >= waypoints.length) return;

        if (this.carPrefabs.length === 0) {
            console.error('[CarSpawner] carPrefabs chua duoc gan!');
            return;
        }

        const node = this.acquireCarNode();
        node.parent = this.carParent ?? this.node;

        const car = node.getComponent(Car)!;
        car.slot = null;
        car.exitParent = this.exitCarParent ?? null;
        car.slotParent = this.slotCarParent ?? null;
        car.onRefuelDone = (pos, slotIndex) => this.onCarRefueled?.(pos, slotIndex);
        car.onRefuelStart = () => this.onCarRefuelStart?.();
        car.onQueueBubbleShown = () => {
            const idx = this._queue.indexOf(car);
            if (idx < 0) return;
            if (idx >= Math.max(1, this.maxHornCars)) return;
            this.onCarQueueBubble?.();
        };
        car.onRecycle = () => this.recycle(node);
        car.onArrivedAtPump = null;
        car.onArrivedInQueue = null;

        this._queue.push(car);
        const targetIndex = this._queue.length - 1;
        const worldWaypoints = waypoints.map((waypoint) => waypoint.worldPosition.clone());

        // Initial fill: xe xuất hiện thẳng ở waypoint đích, không chạy vào từ từ.
        // Sau khi initial queue đầy → các xe sau spawn ở spawnPoint và drive vào.
        const isInitialFill = !this._initialQueueReady;
        if (isInitialFill) {
            const targetPos = worldWaypoints[targetIndex];
            node.worldPosition = targetPos.clone();
            car.setQueueIndex(targetIndex);

            // Xe được coi như vừa đến từ waypoint phía sau (hoặc spawnPoint nếu
            // là waypoint cuối queue) → apply facing tương ứng.
            const fromPos = targetIndex < worldWaypoints.length - 1
                ? worldWaypoints[targetIndex + 1]
                : (this.spawnPoint?.worldPosition.clone() ?? targetPos);
            car.faceMoveDirection(fromPos, targetPos);

            car.moveAlongQueue(worldWaypoints, targetIndex); // no-op path → set state QUEUING
            if (this._queue.length >= waypoints.length) {
                this._initialQueueReady = true;
                this.onInitialQueueReady?.();
            }
            return;
        }

        const spawnWorldPos = this.spawnPoint?.worldPosition
            ?? waypoints[waypoints.length - 1].worldPosition;
        node.worldPosition = spawnWorldPos.clone();
        car.setQueueIndex(waypoints.length);
        car.moveAlongQueue(worldWaypoints, targetIndex);
    }

    private reflowQueue(): void {
        const waypoints = this.getQueueWaypoints();
        const worldWaypoints = waypoints.map((waypoint) => waypoint.worldPosition.clone());

        for (let i = 0; i < this._queue.length; i++) {
            this._queue[i].moveAlongQueue(worldWaypoints, i);
        }
    }

    private acquireCarNode(): Node {
        if (this._pool.length > 0) {
            const node = this._pool.pop()!;
            node.active = true;
            return node;
        }

        const prefab = this.carPrefabs[
            Math.floor(Math.random() * this.carPrefabs.length)
        ];
        return instantiate(prefab);
    }

    private recycle(node: Node): void {
        node.active = false;
        node.parent = this.node;
        this._pool.push(node);
    }
}
