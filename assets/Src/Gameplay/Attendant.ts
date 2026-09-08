import { _decorator, Component, Node, Sprite, Tween, tween, UIOpacity, Vec3, sp } from 'cc';
import { GAME_RUNTIME } from 'db://assets/Src/Core/GameConfig';
const { ccclass, property } = _decorator;

/**
 * Attendant – nhân viên xăng đứng cố định tại slot.
 * Chịu trách nhiệm anim đổ xăng + progress ring trên đầu.
 */
@ccclass('Attendant')
export class Attendant extends Component {
    @property(sp.Skeleton)
    skeleton: sp.Skeleton = null!;

    @property
    idleAnimName: string = 'Back_Idle';

    @property
    workAnimName: string = 'Back_Work';

    @property
    startAnimName: string = 'Back_Start';

    @property
    endAnimName: string = 'Back_End';

    @property({
        tooltip: 'Fallback workIdle khi không có refuelDuration để fit (dùng khi playWork() gọi không context).',
    })
    workIdleDuration: number = 0.2;

    /** Sprite ring – Filled / Radial / fillStart=0.75 (đặt trên đầu attendant) */
    @property(Sprite)
    progressSprite: Sprite = null!;

    /**
     * Bubble text "Speed++" đặt trên đầu attendant. Sẽ được bật + tween nảy
     * lên và fade khi player upgrade speed. Optional – bỏ trống nếu không cần.
     */
    @property({ type: Node, tooltip: 'Bubble "Speed++" bật khi upgrade speed' })
    speedBubble: Node = null!;

    private _progressTween: Tween<Sprite> | null = null;
    /** Duration của segment work-idle (loop) được tính ở playWork để fit refuelDuration. */
    private _pendingWorkIdleDuration: number = 0;

    private _speedBubbleBaseScale: Vec3 | null = null;
    private _speedBubbleBaseLocalPos: Vec3 | null = null;

    protected onEnable(): void {
        this.playIdle();
        this.hideProgress();
        if (this.speedBubble) this.speedBubble.active = false;
    }

    // ─────────────────── Anim ───────────────────────────────

    playIdle(): void {
        this._cancelSequence();
        this._play(this.idleAnimName, true);
    }

    playWork(): void {
        if (!this.skeleton) return;
        this._cancelSequence();
        const entry = this.skeleton.setAnimation(0, this.startAnimName, false);
        const startDur = this._entryDuration(entry);
        const endDur = this._lookupAnimDuration(this.endAnimName);

        // Fit tổng thời gian anim ≈ refuelDuration bằng cách kéo dài (hoặc rút gọn)
        // đoạn work-idle. Nếu không có runtime duration thì fallback về workIdleDuration.
        const refuelDur = GAME_RUNTIME.refuelDuration;
        const remaining = refuelDur - startDur - endDur;
        this._pendingWorkIdleDuration = refuelDur > 0
            ? Math.max(0, remaining)
            : this.workIdleDuration;

        this.scheduleOnce(this._toWorkIdle, startDur);
    }

    private _toWorkIdle = (): void => {
        if (!this.skeleton) return;
        this.skeleton.setAnimation(0, this.workAnimName, true);
        this.scheduleOnce(this._toEnd, this._pendingWorkIdleDuration);
    };

    private _toEnd = (): void => {
        if (!this.skeleton) return;
        const entry = this.skeleton.setAnimation(0, this.endAnimName, false);
        this.scheduleOnce(this._toIdleAfterEnd, this._entryDuration(entry));
    };

    private _toIdleAfterEnd = (): void => {
        if (!this.skeleton) return;
        this.skeleton.setAnimation(0, this.idleAnimName, true);
    };

    private _cancelSequence(): void {
        this.unschedule(this._toWorkIdle);
        this.unschedule(this._toEnd);
        this.unschedule(this._toIdleAfterEnd);
    }

    private _entryDuration(entry: sp.spine.TrackEntry | null): number {
        const anim = (entry as any)?.animation;
        return anim?.duration ?? 0;
    }

    /** Tra duration của 1 anim theo tên (không cần play trước). Trả 0 nếu không tìm được. */
    private _lookupAnimDuration(name: string): number {
        if (!name || !this.skeleton) return 0;
        const data: any = this.skeleton.skeletonData;
        const runtime = data?.getRuntimeData?.();
        const anim = runtime?.findAnimation?.(name);
        return anim?.duration ?? 0;
    }

    private _play(name: string, loop: boolean): void {
        if (!this.skeleton) return;
        this.skeleton.setAnimation(0, name, loop);
    }

    // ─────────────────── Progress ring ──────────────────────

    /** Bắt đầu tween ring theo duration hiện tại (đọc GAME_RUNTIME). */
    showProgress(): void {
        if (!this.progressSprite) return;
        this.progressSprite.fillRange = 0;
        this.progressSprite.node.active = true;
        this._stopTween();
        this._progressTween = tween(this.progressSprite)
            .to(GAME_RUNTIME.refuelDuration, { fillRange: 1 }, { easing: 'linear' })
            .start();
    }

    hideProgress(): void {
        this._stopTween();
        if (this.progressSprite) {
            this.progressSprite.node.active = false;
            this.progressSprite.fillRange = 0;
        }
    }

    private _stopTween(): void {
        if (this._progressTween) { this._progressTween.stop(); this._progressTween = null; }
    }

    // ─────────────────── Speed bubble ────────────────────────

    /** Bật bubble "Speed++": scale-in, nảy lên, fade out. Auto ẩn sau khi tween xong. */
    playSpeedBubble(): void {
        const node = this.speedBubble;
        if (!node) return;

        if (!this._speedBubbleBaseScale) this._speedBubbleBaseScale = node.scale.clone();
        if (!this._speedBubbleBaseLocalPos) this._speedBubbleBaseLocalPos = node.position.clone();

        const baseScale = this._speedBubbleBaseScale.clone();
        const baseLocal = this._speedBubbleBaseLocalPos.clone();
        const risenLocal = new Vec3(baseLocal.x, baseLocal.y + 80, baseLocal.z);
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

    onDestroy(): void {
        this._stopTween();
        this._cancelSequence();
    }
}
