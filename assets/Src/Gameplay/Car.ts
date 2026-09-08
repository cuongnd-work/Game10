import { _decorator, Component, Node, Vec3, tween, Tween, sp } from 'cc';
import { GAME_CONFIG, GAME_RUNTIME } from 'db://assets/Src/Core/GameConfig';
import { Slot } from 'db://assets/Src/Gameplay/Slot';

const { ccclass, property } = _decorator;

export enum CarState {
    QUEUE_MOVING = 'QUEUE_MOVING',
    QUEUING = 'QUEUING',
    DRIVING_IN = 'DRIVING_IN',
    WAITING = 'WAITING',
    REFUELING = 'REFUELING',
    DRIVING_OUT = 'DRIVING_OUT',
}

@ccclass('Car')
export class Car extends Component {
    @property(Node)
    waitingEmoji: Node = null!;

    /**
     * Emoji mặt cười – hiện từ lúc đổ xăng xong cho đến khi car được recycle
     * (moveAlongQueue sẽ tự ẩn lại). Không auto-hide theo timer.
     */
    @property(Node)
    happyEmoji: Node = null!;

    @property(Node)
    iconBubble: Node = null!;

    @property
    moveSpeed: number = 1200;

    @property
    queueMoveSpeed: number = 1600;

    @property(sp.Skeleton)
    skeleton: sp.Skeleton = null!;

    @property(Node)
    visualRoot: Node = null!;

    @property
    frontMoveAnimName: string = 'Front_idle';

    @property
    backMoveAnimName: string = 'Back_idle';

    @property(Vec3)
    frontVisualScale: Vec3 = new Vec3(1, 1, 1);

    @property(Vec3)
    backVisualScale: Vec3 = new Vec3(1, 1, 1);

    @property
    bubbleShowMinDelay: number = 1;

    @property
    bubbleShowMaxDelay: number = 2.5;

    @property
    bubbleVisibleMinDuration: number = 1;

    @property
    bubbleVisibleMaxDuration: number = 2;

    slot: Slot | null = null;
    exitParent: Node | null = null;
    slotParent: Node | null = null;
    onRefuelDone: ((carWorldPos: Vec3, slotIndex: number) => void) | null = null;
    onRefuelStart: (() => void) | null = null;
    onRecycle: (() => void) | null = null;
    onArrivedAtPump: (() => void) | null = null;
    onArrivedInQueue: (() => void) | null = null;
    onQueueBubbleShown: (() => void) | null = null;

    private _state: CarState = CarState.QUEUING;
    private _moveTween: Tween<Node> | null = null;
    private _queueIndex: number = -1;
    private _visualBaseScale: Vec3 = new Vec3(1, 1, 1);
    private _isMoveAnimPlaying: boolean = false;
    private _lastFacingAnim: string = '';
    private _lastFlipX: boolean = false;

    get state(): CarState { return this._state; }

    protected onLoad(): void {
        this.visualRoot = this.visualRoot ?? this.skeleton?.node ?? this.node;
        this.ensureVisualVisible();
        this._visualBaseScale = this.visualRoot.scale.clone();
        if (this.isUnitScale(this.frontVisualScale)) {
            this.frontVisualScale = this._visualBaseScale.clone();
        }
        if (this.isUnitScale(this.backVisualScale)) {
            this.backVisualScale = this._visualBaseScale.clone();
        }
        this.hideWaitingEmoji();
        this.hideHappyEmoji();
        this.hideIconBubble();
    }

    setQueueIndex(index: number): void {
        this._queueIndex = index;
    }

    /**
     * Snap facing/anim theo hướng di chuyển tưởng tượng from → to.
     * Không tween, không đổi worldPosition. Dùng cho pre-spawn queue để xe
     * đứng sẵn nhưng vẫn quay đúng hướng.
     */
    faceMoveDirection(fromWorldPos: Vec3, toWorldPos: Vec3): void {
        const original = this.node.worldPosition.clone();
        this.node.worldPosition = fromWorldPos;
        this.applyMovePresentation(toWorldPos);
        this.node.worldPosition = original;
    }

    moveAlongQueue(waypoints: Vec3[], targetIndex: number): void {
        this.ensureVisualVisible();
        this.hideIconBubble();
        this.hideWaitingEmoji();
        this.hideHappyEmoji();
        this.stopMoveTween();

        // Đảm bảo skeleton luôn có anim đang chạy (kể cả khi lần đầu spawn
        // trùng vị trí waypoint đầu → applyMovePresentation sẽ không đổi anim).
        this.playMoveAnim(this._lastFacingAnim || this.frontMoveAnimName);

        const pathIndices = this.buildQueuePathIndices(waypoints.length, targetIndex);

        if (pathIndices.length === 0) {
            // State mặc định = QUEUING nên setState(QUEUING) là no-op → refresh
            // bubble không được trigger. Gọi thẳng để pre-spawn car cũng schedule
            // icon bubble ngay từ đầu, không phải chờ chuyển state.
            this.setState(CarState.QUEUING);
            this.refreshQueueBubbleState();
            return;
        }

        this.setState(CarState.QUEUE_MOVING);

        let chain = tween(this.node);
        let currentWorldPos = this.node.worldPosition.clone();
        for (const index of pathIndices) {
            const waypoint = waypoints[index];
            const local = this.worldToParentLocal(waypoint);
            chain = chain.call(() => {
                this.applyMovePresentation(waypoint);
            });
            chain = chain.to(
                this.getMoveDuration(currentWorldPos, waypoint, this.queueMoveSpeed),
                { position: local },
                { easing: 'linear' },
            );
            chain = chain.call(() => {
                this._queueIndex = index;
            });
            currentWorldPos = waypoint.clone();
        }

        this._moveTween = chain
            .call(() => {
                this.setState(CarState.QUEUING);
                this.onArrivedInQueue?.();
            })
            .start();
    }

    startDriveIn(): void {
        if (!this.slot) return;
        this.ensureVisualVisible();
        this.hideIconBubble();
        this.setState(CarState.DRIVING_IN);
        this.hideWaitingEmoji();
        // Xe vừa rời head-of-queue → cho xuống layer thấp nhất trong parent
        // hiện tại (carParent) để render sau các xe queue phía sau.
        this.node.setSiblingIndex(0);

        const waypoints = this.slot.getEntryWaypointsWorld();
        if (waypoints.length === 0) {
            this.arriveAtPump();
            return;
        }

        // Chạy qua các waypoint trung gian trước; chỉ reparent + drive final leg
        // (vào pump) sau khi đã tới waypoint áp cuối – tránh đổi container quá
        // sớm khi xe vẫn còn nằm trên đường chung.
        const intermediate = waypoints.slice(0, -1);
        const finalLeg = [waypoints[waypoints.length - 1]];

        const driveFinalLeg = () => {
            this.reparentToSlotParent();
            this.followWaypoints(
                finalLeg,
                GAME_CONFIG.CAR_DRIVE_SEGMENT_DURATION,
                () => this.arriveAtPump(),
            );
        };

        if (intermediate.length === 0) {
            driveFinalLeg();
            return;
        }

        this.followWaypoints(
            intermediate,
            GAME_CONFIG.CAR_DRIVE_SEGMENT_DURATION,
            driveFinalLeg,
        );
    }

    private reparentToSlotParent(): void {
        if (!this.slotParent || this.node.parent === this.slotParent) return;
        const worldPos = this.node.worldPosition.clone();
        this.node.setParent(this.slotParent, true);
        this.node.worldPosition = worldPos;
        // Trong slotParent cũng để xe ở layer thấp nhất (dưới slot visuals).
        this.node.setSiblingIndex(0);
    }

    notifyAttendantReady(): void {
        if (this._state === CarState.WAITING) {
            this.beginRefuel();
        }
    }

    private arriveAtPump(): void {
        this.hideIconBubble();
        this.onArrivedAtPump?.();
        this.onArrivedAtPump = null;

        if (!this.slot) return;
        this.slot.notifyCarArrivedAtPump();
        if (this.slot.attendantUnlocked) {
            this.beginRefuel();
        } else {
            this.setState(CarState.WAITING);
            this.showWaitingEmoji();
        }
    }

    private beginRefuel(): void {
        if (!this.slot) return;
        this.hideIconBubble();
        this.setState(CarState.REFUELING);
        this.hideWaitingEmoji();

        const attendant = this.slot.attendant;
        attendant?.playWork();
        attendant?.showProgress();

        this.onRefuelStart?.();

        this.scheduleOnce(() => this.finishRefuel(), GAME_RUNTIME.refuelDuration);
    }

    private finishRefuel(): void {
        if (!this.slot) return;
        this.hideIconBubble();
        const attendant = this.slot.attendant;
        attendant?.hideProgress();
        attendant?.playIdle();

        this.showHappyEmoji();

        const carWorldPos = this.node.worldPosition.clone();
        this.onRefuelDone?.(carWorldPos, this.slot.slotIndex);

        this.slot.freeCar();
        const exitWaypoints = this.slot.getExitWaypointsWorld();
        this.slot = null;

        this.setState(CarState.DRIVING_OUT);

        if (exitWaypoints.length === 0) {
            this.reparentForExit();
            this.onRecycle?.();
            return;
        }

        const firstLeg = [exitWaypoints[0]];
        const restLegs = exitWaypoints.slice(1);

        this.followWaypoints(firstLeg, GAME_CONFIG.CAR_DRIVE_SEGMENT_DURATION, () => {
            this.reparentForExit();
            if (restLegs.length === 0) {
                this.onRecycle?.();
                return;
            }
            this.followWaypoints(
                restLegs,
                GAME_CONFIG.CAR_DRIVE_SEGMENT_DURATION,
                () => this.onRecycle?.(),
            );
        });
    }

    private reparentForExit(): void {
        if (!this.exitParent || this.node.parent === this.exitParent) return;
        const worldPos = this.node.worldPosition.clone();
        this.node.setParent(this.exitParent, true);
        this.node.worldPosition = worldPos;
    }

    private followWaypoints(waypoints: Vec3[], segmentDuration: number, onDone: () => void): void {
        this.ensureVisualVisible();
        this.hideIconBubble();
        this.stopMoveTween();
        if (waypoints.length === 0) {
            onDone();
            return;
        }

        // Đảm bảo skeleton đang có anim chạy trước khi vào chain di chuyển.
        this.playMoveAnim(this._lastFacingAnim || this.frontMoveAnimName);

        let chain = tween(this.node);
        let currentWorldPos = this.node.worldPosition.clone();
        for (const waypoint of waypoints) {
            const local = this.worldToParentLocal(waypoint);
            chain = chain.call(() => {
                this.applyMovePresentation(waypoint);
            });
            chain = chain.to(
                this.getMoveDuration(currentWorldPos, waypoint, this.moveSpeed),
                { position: local },
                { easing: 'linear' },
            );
            currentWorldPos = waypoint.clone();
        }

        this._moveTween = chain
            .call(onDone)
            .start();
    }

    private buildQueuePathIndices(waypointCount: number, targetIndex: number): number[] {
        if (waypointCount === 0) return [];

        const path: number[] = [];

        if (this._queueIndex > targetIndex) {
            for (let i = this._queueIndex - 1; i >= targetIndex; i--) {
                path.push(i);
            }
            return path;
        }

        if (this._queueIndex < targetIndex) {
            for (let i = this._queueIndex + 1; i <= targetIndex; i++) {
                path.push(i);
            }
        }

        return path;
    }

    private showWaitingEmoji(): void {
        if (this.waitingEmoji) this.waitingEmoji.active = true;
    }

    private hideWaitingEmoji(): void {
        if (this.waitingEmoji) this.waitingEmoji.active = false;
    }

    private showHappyEmoji(): void {
        if (!this.happyEmoji) return;
        this.happyEmoji.active = true;
    }

    private hideHappyEmoji(): void {
        if (this.happyEmoji) this.happyEmoji.active = false;
    }

    private worldToParentLocal(worldPos: Vec3): Vec3 {
        const local = new Vec3();
        const parent = this.node.parent;
        if (parent) parent.inverseTransformPoint(local, worldPos);
        else Vec3.copy(local, worldPos);
        return local;
    }

    private stopMoveTween(): void {
        if (this._moveTween) {
            this._moveTween.stop();
            this._moveTween = null;
        }
    }

    private getMoveDuration(fromWorldPos: Vec3, targetWorldPos: Vec3, speedValue: number): number {
        const distance = Vec3.distance(fromWorldPos, targetWorldPos);
        const speed = Math.max(1, speedValue);
        return Math.max(0.01, distance / speed);
    }

    private applyMovePresentation(targetWorldPos: Vec3): void {
        this.ensureVisualVisible();
        const dx = targetWorldPos.x - this.node.worldPosition.x;
        const dy = targetWorldPos.y - this.node.worldPosition.y;

        let animName: string;
        let flipX: boolean;
        let baseScale: Vec3;

        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
            // Không có delta hướng → dùng hướng cuối cùng đã áp dụng
            // (hoặc default frontMoveAnim nếu chưa từng có), vẫn play anim
            // để car không đứng im không animation.
            animName = this._lastFacingAnim || this.frontMoveAnimName;
            flipX = this._lastFlipX;
            baseScale = animName === this.backMoveAnimName
                ? this.backVisualScale
                : this.frontVisualScale;
        } else if (dx >= 0 && dy <= 0) {
            animName = this.frontMoveAnimName;
            flipX = false;
            baseScale = this.frontVisualScale;
        } else if (dx <= 0 && dy >= 0) {
            animName = this.backMoveAnimName;
            flipX = false;
            baseScale = this.backVisualScale;
        } else if (dx >= 0 && dy >= 0) {
            animName = this.backMoveAnimName;
            flipX = true;
            baseScale = this.backVisualScale;
        } else {
            animName = this.frontMoveAnimName;
            flipX = true;
            baseScale = this.frontVisualScale;
        }

        const targetScale = baseScale.clone();
        targetScale.x = Math.abs(targetScale.x) * (flipX ? -1 : 1);
        this.visualRoot.setScale(targetScale);
        this._lastFacingAnim = animName;
        this._lastFlipX = flipX;
        this.playMoveAnim(animName);
    }

    private playMoveAnim(name: string): void {
        if (!this.skeleton || !name) return;
        this.skeleton.timeScale = 1;
        this.skeleton.setAnimation(0, name, true);
        this._isMoveAnimPlaying = true;
    }

    private stopMoveAnim(): void {
        if (!this.skeleton) return;
        if (!this._isMoveAnimPlaying) return;
        this.skeleton.timeScale = 0;
        this._isMoveAnimPlaying = false;
    }

    onDestroy(): void {
        this.stopMoveTween();
        this.unscheduleAllCallbacks();
    }

    private setState(nextState: CarState): void {
        if (this._state === nextState) return;
        this._state = nextState;
        this.refreshQueueBubbleState();
    }

    // ── NEW: bubble hiện liên tục khi QUEUING, ẩn khi vào state khác (drive/refuel/...) ──
    private refreshQueueBubbleState(): void {
        if (!this.iconBubble) return;
        const shouldShow = this._state === CarState.QUEUING;
        const wasVisible = this.iconBubble.active;
        this.iconBubble.active = shouldShow;
        if (shouldShow && !wasVisible) {
            this.onQueueBubbleShown?.();
        }
    }

    // ── LEGACY: bubble bật/tắt random (comment để test hàm mới trên) ──
    /*
    private refreshQueueBubbleState(): void {
        if (this._state === CarState.QUEUING) {
            this.scheduleNextBubble();
            return;
        }

        this.unschedule(this.showQueueBubble);
        this.unschedule(this.hideQueueBubble);
        this.hideIconBubble();
    }

    private scheduleNextBubble(): void {
        this.unschedule(this.showQueueBubble);
        this.unschedule(this.hideQueueBubble);
        this.hideIconBubble();

        if (!this.iconBubble || this._state !== CarState.QUEUING) {
            return;
        }

        this.scheduleOnce(this.showQueueBubble, this.randomRange(this.bubbleShowMinDelay, this.bubbleShowMaxDelay));
    }

    private showQueueBubble = (): void => {
        if (!this.iconBubble || this._state !== CarState.QUEUING) {
            return;
        }

        this.iconBubble.active = true;
        this.onQueueBubbleShown?.();
        this.scheduleOnce(this.hideQueueBubble, this.randomRange(this.bubbleVisibleMinDuration, this.bubbleVisibleMaxDuration));
    };

    private hideQueueBubble = (): void => {
        this.hideIconBubble();
        if (this._state === CarState.QUEUING) {
            this.scheduleNextBubble();
        }
    };
    */

    private hideIconBubble(): void {
        if (this.iconBubble) {
            this.iconBubble.active = false;
        }
    }

    private ensureVisualVisible(): void {
        if (this.visualRoot) {
            this.visualRoot.active = true;
        }
        if (this.skeleton?.node) {
            this.skeleton.node.active = true;
        }
    }

    private randomRange(min: number, max: number): number {
        if (max <= min) return Math.max(0, min);
        return min + Math.random() * (max - min);
    }

    private isUnitScale(scale: Vec3): boolean {
        return Math.abs(scale.x - 1) < 0.001
            && Math.abs(scale.y - 1) < 0.001
            && Math.abs(scale.z - 1) < 0.001;
    }
}
