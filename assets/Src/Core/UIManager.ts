import { _decorator, Component, Node, Label, Animation, UIOpacity, tween, Vec3 } from 'cc';
import { GAME_CONFIG } from 'db://assets/Src/Core/GameConfig';
import { CursorHint } from 'db://assets/Src/Effects/CursorHint';
const { ccclass, property } = _decorator;

/**
 * UIManager – trong flow mới chỉ còn lo money label + warning + cursor hint.
 * Upgrade UI được đặt trực tiếp trên từng Slot.
 */
@ccclass('UIManager')
export class UIManager extends Component {
    @property(Label)
    moneyLabel: Label = null!;

    @property(Node)
    warningTextNode: Node = null!;

    @property(Animation)
    warningAnim: Animation = null!;

    @property
    warningAnimName: string = 'warning';

    @property(CursorHint)
    cursorHint: CursorHint = null!;

    private _warningOpacity: UIOpacity | null = null;
    private _warningBaseEulerZ: number = 0;
    private _moneyLabelBaseScale: Vec3 | null = null;

    protected onLoad(): void {
        if (this.warningTextNode) {
            this._warningOpacity = this.warningTextNode.getComponent(UIOpacity)
                || this.warningTextNode.addComponent(UIOpacity);
            this._warningBaseEulerZ = this.warningTextNode.eulerAngles.z;
            this.warningTextNode.active = false;
        }
        if (this.moneyLabel) {
            this._moneyLabelBaseScale = this.moneyLabel.node.scale.clone();
        }
    }

    // ─────────────────── Money ───────────────────────────────

    updateMoney(amount: number): void {
        if (this.moneyLabel) this.moneyLabel.string = `$${this.formatMoney(amount)}`;
    }

    emphasizeMoneyGain(): void {
        if (!this.moneyLabel) return;

        const target = this.moneyLabel.node;
        const origin = this.getMoneyLabelBaseScale();
        const big = new Vec3(origin.x * 1.12, origin.y * 1.12, origin.z);
        const wide = new Vec3(origin.x * 1.18, origin.y * 0.96, origin.z);

        tween(target).stop();
        target.setScale(origin);

        tween(target)
            .to(0.08, { scale: big }, { easing: 'quadOut' })
            .to(0.08, { scale: origin }, { easing: 'quadIn' })
            .to(0.08, { scale: wide }, { easing: 'quadOut' })
            .to(0.08, { scale: origin }, { easing: 'quadIn' })
            .start();
    }

    private getMoneyLabelBaseScale(): Vec3 {
        if (!this._moneyLabelBaseScale) {
            this._moneyLabelBaseScale = this.moneyLabel
                ? this.moneyLabel.node.scale.clone()
                : new Vec3(1, 1, 1);
        }
        return this._moneyLabelBaseScale.clone();
    }

    // ─────────────────── Warning text ────────────────────────

    showWarning(): void {
        if (this.warningAnim) this.warningAnim.play(this.warningAnimName);
        if (this.warningTextNode) {
            this.warningTextNode.active = true;
            if (this._warningOpacity) this._warningOpacity.opacity = 255;
            this.playWarningShake();
        }
        this.unschedule(this.hideWarning);
        this.scheduleOnce(this.hideWarning, GAME_CONFIG.NO_SLOT_DISPLAY_DURATION);
    }

    private hideWarning = (): void => {
        if (!this.warningTextNode || !this._warningOpacity) return;
        tween(this._warningOpacity)
            .to(0.3, { opacity: 0 })
            .call(() => { this.warningTextNode.active = false; })
            .start();
    };

    private playWarningShake(): void {
        if (!this.warningTextNode) return;

        const baseEulerZ = this._warningBaseEulerZ;
        this.warningTextNode.setRotationFromEuler(0, 0, baseEulerZ);

        tween(this.warningTextNode)
            .stop();

        tween(this.warningTextNode)
            .to(0.05, { eulerAngles: new Vec3(0, 0, baseEulerZ - 8) })
            .to(0.05, { eulerAngles: new Vec3(0, 0, baseEulerZ + 8) })
            .to(0.05, { eulerAngles: new Vec3(0, 0, baseEulerZ - 5) })
            .to(0.05, { eulerAngles: new Vec3(0, 0, baseEulerZ + 5) })
            .to(0.05, { eulerAngles: new Vec3(0, 0, baseEulerZ) })
            .start();
    }

    // ─────────────────── Cursor hint ─────────────────────────

    pointHintAt(target: Node | null, overlayTarget?: Node | null, kind: 'gift' | 'button' = 'button'): void {
        if (!this.cursorHint) return;
        if (target) this.cursorHint.pointAt(target, overlayTarget ?? null, kind);
        else this.cursorHint.hide();
    }

    hideHint(): void {
        this.cursorHint?.hide();
    }

    // ─────────────────── Helpers ─────────────────────────────

    bounceNode(node: Node): void {
        if (!node) return;
        const origin = node.scale.clone();
        const big = new Vec3(origin.x * 1.05, origin.y * 1.05, origin.z);
        tween(node)
            .to(0.1, { scale: big },    { easing: 'quadOut' })
            .to(0.1, { scale: origin }, { easing: 'elasticOut' })
            .start();
    }

    private formatMoney(amount: number): string {
        if (amount >= 1_000_000_000) {
            return this.formatCompact(amount / 1_000_000_000, 'b');
        }
        if (amount >= 1_000_000) {
            return this.formatCompact(amount / 1_000_000, 'm');
        }
        if (amount >= 1_000) {
            return this.formatCompact(amount / 1_000, 'k');
        }
        return `${Math.floor(amount)}`;
    }

    private formatCompact(value: number, suffix: string): string {
        const rounded = value >= 10
            ? Math.floor(value)
            : Math.floor(value * 10) / 10;
        return `${rounded}${suffix}`;
    }
}
