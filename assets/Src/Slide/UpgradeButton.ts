import { _decorator, Button, Color, Component, EventTouch, Label, Node, Sprite, Tween, tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/** Trạng thái 1 trục upgrade, do SlideGame tính và đẩy xuống button. */
export interface UpgradeButtonState {
    /** Số lần đã upgrade. */
    level: number;
    /** Số lần upgrade tối đa. */
    max: number;
    /** Giá cho lần upgrade kế tiếp (0 khi đã MAX). */
    cost: number;
    /** Đủ tiền mua lần kế tiếp. */
    canAfford: boolean;
    /** Đã đạt trần upgrade. */
    isMax: boolean;
}

/**
 * UpgradeButton – 1 nút upgrade trên HUD. Gom toàn bộ logic label/màu/overlay/
 * bounce/tap của 1 nút (bản UpgradePanel cũ lặp lại logic này 3 lần).
 *
 * Trạng thái theo spec mục 5:
 *   - thiếu tiền  → chữ giá đổi màu đỏ, vẫn bấm được (bấm ra cảnh báo)
 *   - đạt MAX     → nút xám, chữ giá thay bằng "MAX", không bấm được
 */
@ccclass('UpgradeButton')
export class UpgradeButton extends Component {
    @property({ type: Node, tooltip: 'Node nhận tap + được bounce. Bỏ trống = dùng node này.' })
    tapTarget: Node = null!;

    @property(Label)
    costLabel: Label = null!;

    @property({ type: Node, tooltip: 'Legacy hand anchor; hint hiện bám theo tâm tapTarget.' })
    handTapTarget: Node = null!;

    @property({ type: Sprite, tooltip: 'Sprite nền của nút – bị tô xám khi MAX' })
    buttonSprite: Sprite = null!;

    @property({ type: Node, tooltip: 'Overlay phủ thêm khi MAX (optional)' })
    maxOverlay: Node = null!;

    @property(Color)
    normalTint: Color = new Color(255, 255, 255, 255);

    @property(Color)
    maxTint: Color = new Color(130, 130, 130, 255);

    @property(Color)
    costNormalColor: Color = new Color(255, 255, 255, 255);

    @property(Color)
    costInsufficientColor: Color = new Color(255, 70, 70, 255);

    @property(Color)
    costMaxColor: Color = new Color(220, 220, 220, 255);

    @property
    costPrefix: string = '$';

    @property
    maxText: string = 'MAX';

    onClick: (() => void) | null = null;

    private _isMax: boolean = false;
    private _canAfford: boolean = false;
    private _touchInside: boolean = false;
    private _bounce: Tween<Node> | null = null;
    private _baseScale: Vec3 | null = null;

    get isMax(): boolean { return this._isMax; }
    get isVisible(): boolean { return this.node.active; }

    protected onLoad(): void {
        this.tapTarget = this.tapTarget ?? this.node;
        this.bindTouch();
        if (this.maxOverlay) this.maxOverlay.active = false;
    }

    /** Cập nhật hiển thị theo state hiện tại. */
    apply(state: UpgradeButtonState): void {
        this._isMax = state.isMax;
        this._canAfford = state.canAfford && !state.isMax;

        if (this.costLabel) {
            this.costLabel.string = state.isMax
                ? this.maxText
                : `${this.costPrefix}${state.cost}`;
            this.costLabel.color = state.isMax
                ? this.costMaxColor
                : (state.canAfford ? this.costNormalColor : this.costInsufficientColor);
        }

        if (this.buttonSprite) {
            this.buttonSprite.color = state.isMax ? this.maxTint : this.normalTint;
        }
        if (this.maxOverlay) this.maxOverlay.active = state.isMax;

        if (this._canAfford) this.startBounce();
        else this.stopBounce();
    }

    setVisible(visible: boolean): void {
        if (this.node.active === visible) return;
        this.node.active = visible;
        if (!visible) this.stopBounce();
    }

    getHintTarget(): Node | null {
        // Các HandAnchor cũ nằm dưới button nên làm con trỏ bị đẩy khỏi vùng
        // bấm. Tâm tapTarget là mốc chung chính xác cho mọi kích thước button.
        return this.tapTarget ?? this.node;
    }

    /** Hiệu ứng nhấn khi tap. */
    punch(): void {
        const target = this.tapTarget ?? this.node;
        const base = this.getBaseScale();
        const punched = new Vec3(base.x * 0.9, base.y * 0.9, base.z);

        this.stopBounce();
        target.setScale(base);
        tween(target)
            .to(0.06, { scale: punched }, { easing: 'quadOut' })
            .to(0.14, { scale: base }, { easing: 'backOut' })
            .call(() => { if (this._canAfford) this.startBounce(); })
            .start();
    }

    protected onDestroy(): void {
        this.stopBounce();
    }

    // ── Internal ─────────────────────────────────────────────────

    private bindTouch(): void {
        const target = this.tapTarget;
        if (!target) return;

        // Nếu editor đã gắn Button + clickEvents thì tôn trọng thứ đó.
        const button = target.getComponent(Button);
        if (button && button.clickEvents.length > 0) return;

        target.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        target.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        target.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    private onTouchStart = (e: EventTouch): void => {
        this._touchInside = true;
        e.propagationStopped = true;
    };

    private onTouchEnd = (e: EventTouch): void => {
        const wasInside = this._touchInside;
        this._touchInside = false;
        e.propagationStopped = true;
        if (!wasInside) return;
        // MAX thì nút chết hẳn; thiếu tiền vẫn cho bấm để hiện cảnh báo.
        if (this._isMax) return;
        this.onClick?.();
        this.punch();
    };

    private onTouchCancel = (): void => {
        this._touchInside = false;
    };

    private startBounce(): void {
        this.stopBounce();
        const target = this.tapTarget ?? this.node;
        const base = this.getBaseScale();
        const big = new Vec3(base.x * 1.05, base.y * 1.05, base.z);
        target.setScale(base);
        this._bounce = tween(target)
            .repeatForever(
                tween(target)
                    .to(0.35, { scale: big }, { easing: 'sineOut' })
                    .to(0.35, { scale: base }, { easing: 'sineInOut' })
                    .delay(0.18),
            )
            .start();
    }

    private stopBounce(): void {
        if (this._bounce) {
            this._bounce.stop();
            this._bounce = null;
        }
        const target = this.tapTarget ?? this.node;
        if (target) target.setScale(this.getBaseScale());
    }

    private getBaseScale(): Vec3 {
        if (!this._baseScale) {
            const target = this.tapTarget ?? this.node;
            this._baseScale = target ? target.scale.clone() : new Vec3(1, 1, 1);
        }
        return this._baseScale.clone();
    }
}
