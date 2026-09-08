import { _decorator, Component, EventTouch, Node, tween, Tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/**
 * GiftBoxIntro – ẩn toàn bộ trạm xăng, hiện hộp quà lắc lắc.
 * Player bấm hộp quà → hộp biến mất, trạm xăng hiện lên với hiệu ứng pop.
 * GameManager subscribe onOpened để mở khoá gameplay (spawn xe, etc.).
 */
@ccclass('GiftBoxIntro')
export class GiftBoxIntro extends Component {
    @property(Node)
    giftBox: Node = null!;
    @property(Node)
    eff : Node = null!;

    /** Root chứa toàn bộ hình ảnh trạm xăng + 4 cây xăng. Ẩn ban đầu. */
    @property(Node)
    stationRoot: Node = null!;

    @property
    wiggleAngle: number = 12;

    @property
    wiggleDuration: number = 0.16;

    @property
    wigglePauseDuration: number = 0.6;

    @property
    revealDuration: number = 0.35;

    onOpened: (() => void) | null = null;

    private _wiggleTween: Tween<Node> | null = null;
    private _opened: boolean = false;
    private _touchStartedInside: boolean = false;

    protected onLoad(): void {
        if (this.stationRoot) this.stationRoot.active = false;

        if (this.giftBox) {
            this.giftBox.active = true;
            this.giftBox.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.giftBox.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.giftBox.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        }
    }

    protected start(): void {
        this.startWiggle();
    }

    protected onDestroy(): void {
        this.stopWiggle();
        if (this.giftBox) {
            this.giftBox.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.giftBox.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.giftBox.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        }
    }

    get isOpened(): boolean { return this._opened; }

    private onTouchStart(event: EventTouch): void {
        if (this._opened) return;
        this._touchStartedInside = true;
        event.propagationStopped = true;
    }

    private onTouchEnd(event: EventTouch): void {
        const wasInside = this._touchStartedInside;
        this._touchStartedInside = false;
        event.propagationStopped = true;
        if (this._opened) return;
        if (wasInside) this.open();
    }

    private onTouchCancel(): void {
        this._touchStartedInside = false;
    }

    private open(): void {
        if (this._opened) return;
        this._opened = true;
        this.stopWiggle();

        const gift = this.giftBox;
        const onDone = () => {
            if (gift) gift.active = false;
            this.eff.active = false;
            this.revealStation();
            const cb = this.onOpened;
            this.onOpened = null;
            cb?.();
        };

        if (!gift) { onDone(); return; }

        tween(gift)
            .to(0.18, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
            .call(onDone)
            .start();
    }

    private revealStation(): void {
        if (!this.stationRoot) return;
        const origin = this.stationRoot.scale.clone();
        this.stationRoot.active = true;
        this.stationRoot.setScale(0, 0, 0);
        tween(this.stationRoot)
            .to(this.revealDuration, { scale: origin }, { easing: 'backOut' })
            .start();
    }

    private startWiggle(): void {
        if (!this.giftBox) return;
        this.stopWiggle();
        const base = this.giftBox.eulerAngles.clone();
        const posBase = this.giftBox.position.clone();
        const upPos = new Vec3(posBase.x, posBase.y + 18, posBase.z);
        const half = Math.max(0.01, this.wiggleDuration * 0.5);
        const wig = Math.max(1, this.wiggleAngle);
        const pause = Math.max(0, this.wigglePauseDuration);

        this._wiggleTween = tween(this.giftBox)
            .repeatForever(
                tween(this.giftBox)
                    .parallel(
                        tween(this.giftBox)
                            .to(half, { eulerAngles: new Vec3(0, 0, base.z + wig) })
                            .to(half * 2, { eulerAngles: new Vec3(0, 0, base.z - wig) })
                            .to(half, { eulerAngles: new Vec3(0, 0, base.z) }),
                        tween(this.giftBox)
                            .to(half * 2, { position: upPos }, { easing: 'sineOut' })
                            .to(half * 2, { position: posBase }, { easing: 'sineIn' }),
                    )
                    .delay(pause),
            )
            .start();
    }

    private stopWiggle(): void {
        if (this._wiggleTween) {
            this._wiggleTween.stop();
            this._wiggleTween = null;
        }
    }
}
