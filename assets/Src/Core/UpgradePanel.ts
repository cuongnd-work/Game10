import { _decorator, Button, Component, EventTouch, Label, Node, Tween, tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export interface UpgradePanelState {
    /** Có còn pump chưa unlock hay không. */
    hasPendingPump: boolean;
    /** Giá pump kế tiếp (nếu có). */
    nextPumpCost: number;
    /** Đủ tiền để mua pump kế tiếp. */
    canAffordPump: boolean;

    /**
     * Còn mốc speed nào để upgrade hay không. Speed upgrade tuần tự theo
     * GAME_CONFIG.SPEED_UPGRADE_COSTS – hết cost = hết mốc.
     */
    hasPendingSpeedUpgrade: boolean;
    /** Điều kiện gate: đã mở ít nhất 1 pump. */
    speedUpgradeReady: boolean;
    /** Giá cho lần upgrade speed kế tiếp. */
    nextSpeedUpgradeCost: number;
    /** Đủ tiền để upgrade speed. */
    canAffordSpeedUpgrade: boolean;

    /** Cost để mở fake button. */
    fakeCost: number;
    /** Đủ tiền để tap fake. */
    canAffordFake: boolean;
}

/**
 * UpgradePanel – HUD cố định gồm 3 button:
 *   1) slotTapTarget  – upgrade pump kế tiếp (tuần tự, unlock cả attendant cùng slot).
 *   2) attendantTapTarget – (semantically SPEED upgrade) upgrade tốc độ đổ xăng
 *      tuần tự theo SPEED_UPGRADE_COSTS. Giữ tên field cũ để không phá scene bindings.
 *   3) fakeTapTarget – luôn redirect ra store.
 *
 * Panel không tự biết game state – GasStation gọi `refresh(state)` mỗi khi có
 * thay đổi (tiền, unlock, xe tới…).
 */
@ccclass('UpgradePanel')
export class UpgradePanel extends Component {
    // ── Slot button ───────────────────────────────────────────────
    /** Node tổng: nhận tap + được bounce + toggle active. */
    @property(Node)
    slotTapTarget: Node = null!;

    @property(Label)
    slotCostLabel: Label = null!;

    /** Node nhỏ chỉ để định vị hand-tap của CursorHint. */
    @property(Node)
    slotHandTapTarget: Node = null!;

    /** Overlay phủ khi button KHÔNG tap được (thiếu tiền / chưa tới lượt). */
    @property(Node)
    slotOverlay: Node = null!;

    // ── Speed upgrade button (giữ tên property cũ = attendant* để giữ scene bindings) ──
    @property(Node)
    attendantTapTarget: Node = null!;

    @property(Label)
    attendantCostLabel: Label = null!;

    @property(Node)
    attendantHandTapTarget: Node = null!;

    @property(Node)
    attendantOverlay: Node = null!;

    // Spine "appear" fx + bubble "Speed++" do GasStation kích hoạt trên
    // từng Slot/Attendant đã mở – không cần config visual thêm ở panel.

    // ── Fake button (mở khi đủ tiền, độc lập với slot/speed) ─
    @property(Node)
    fakeTapTarget: Node = null!;

    @property(Label)
    fakeCostLabel: Label = null!;

    @property(Node)
    fakeHandTapTarget: Node = null!;

    @property(Node)
    fakeOverlay: Node = null!;

    private _onSlotClick: (() => void) | null = null;
    private _onAttendantClick: (() => void) | null = null;
    private _onFakeClick: (() => void) | null = null;

    private _slotBounce: Tween<Node> | null = null;
    private _attendantBounce: Tween<Node> | null = null;
    private _fakeBounce: Tween<Node> | null = null;

    private _slotBaseScale: Vec3 | null = null;
    private _attendantBaseScale: Vec3 | null = null;
    private _fakeBaseScale: Vec3 | null = null;

    private _touchInsideSlot = false;
    private _touchInsideAttendant = false;
    private _touchInsideFake = false;

    private _slotEnabled = false;
    private _attendantEnabled = false;
    private _fakeEnabled = false;

    protected onLoad(): void {
        this.bindButton(this.slotTapTarget, 'slot');
        this.bindButton(this.attendantTapTarget, 'attendant');
        this.bindButton(this.fakeTapTarget, 'fake');
    }

    configure(
        onSlotClick: () => void,
        onAttendantClick: () => void,
        onFakeClick: () => void,
    ): void {
        this._onSlotClick = onSlotClick;
        this._onAttendantClick = onAttendantClick;
        this._onFakeClick = onFakeClick;
    }

    refresh(state: UpgradePanelState): void {
        this.refreshSlot(state);
        this.refreshAttendant(state);
        this.refreshFake(state);
    }

    /** Trả về node hint cho CursorHint. Ưu tiên slot > speed > fake. */
    getHintTarget(state: UpgradePanelState): Node | null {
        if (state.hasPendingPump && state.canAffordPump) {
            return this.slotHandTapTarget ?? this.slotTapTarget ?? null;
        }
        if (state.hasPendingSpeedUpgrade && state.speedUpgradeReady && state.canAffordSpeedUpgrade) {
            return this.attendantHandTapTarget ?? this.attendantTapTarget ?? null;
        }
        if (state.canAffordFake) {
            return this.fakeHandTapTarget ?? this.fakeTapTarget ?? null;
        }
        return null;
    }

    hideAll(): void {
        if (this.slotTapTarget) this.slotTapTarget.active = false;
        if (this.attendantTapTarget) this.attendantTapTarget.active = false;
        if (this.fakeTapTarget) this.fakeTapTarget.active = false;
        if (this.slotOverlay) this.slotOverlay.active = false;
        if (this.attendantOverlay) this.attendantOverlay.active = false;
        if (this.fakeOverlay) this.fakeOverlay.active = false;
        this._slotEnabled = false;
        this._attendantEnabled = false;
        this._fakeEnabled = false;
        this.stopBounce('slot');
        this.stopBounce('attendant');
        this.stopBounce('fake');
    }

    /** Tutorial stage 1: chỉ hiện slot tapTarget, giấu speed + fake. */
    showSlotOnly(): void {
        if (this.slotTapTarget) this.slotTapTarget.active = true;
        if (this.attendantTapTarget) this.attendantTapTarget.active = false;
        if (this.fakeTapTarget) this.fakeTapTarget.active = false;
    }

    /** Tutorial stage 2+: hiện toàn bộ 3 button. */
    showAll(): void {
        if (this.slotTapTarget) this.slotTapTarget.active = true;
        if (this.attendantTapTarget) this.attendantTapTarget.active = true;
        if (this.fakeTapTarget) this.fakeTapTarget.active = true;
    }

    /** Target hand-tap cho từng loại button (dùng cho tutorial). */
    getSlotHintTarget(): Node | null {
        return this.slotHandTapTarget ?? this.slotTapTarget ?? null;
    }

    /** Semantically SPEED hint target. */
    getAttendantHintTarget(): Node | null {
        return this.attendantHandTapTarget ?? this.attendantTapTarget ?? null;
    }

    getFakeHintTarget(): Node | null {
        return this.fakeHandTapTarget ?? this.fakeTapTarget ?? null;
    }

    /**
     * Trả về hint target cho button có cost cao nhất trong nhóm đang enable
     * (đủ tiền + còn pending). Dùng khi player idle trong free mode.
     */
    getHighestCostHintTarget(state: UpgradePanelState): Node | null {
        const candidates: Array<{ cost: number; target: Node | null }> = [];
        if (state.hasPendingPump && state.canAffordPump) {
            candidates.push({ cost: state.nextPumpCost, target: this.getSlotHintTarget() });
        }
        if (state.hasPendingSpeedUpgrade && state.speedUpgradeReady && state.canAffordSpeedUpgrade) {
            candidates.push({ cost: state.nextSpeedUpgradeCost, target: this.getAttendantHintTarget() });
        }
        if (state.canAffordFake) {
            candidates.push({ cost: state.fakeCost, target: this.getFakeHintTarget() });
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.cost - a.cost);
        return candidates[0].target;
    }

    // ── Internal ─────────────────────────────────────────────────

    private refreshSlot(state: UpgradePanelState): void {
        if (!this.slotTapTarget) return;

        // Không unactive tapTarget – luôn giữ visible, chỉ toggle overlay + gate event.
        if (this.slotCostLabel) {
            this.slotCostLabel.string = state.hasPendingPump
                ? `${state.nextPumpCost}`
                : 'MAX';
        }

        const enabled = state.hasPendingPump && state.canAffordPump;
        this._slotEnabled = enabled;
        if (this.slotOverlay) this.slotOverlay.active = !enabled;
        if (enabled) this.startBounce('slot');
        else this.stopBounce('slot');
    }

    private refreshAttendant(state: UpgradePanelState): void {
        if (!this.attendantTapTarget) return;

        if (this.attendantCostLabel) {
            this.attendantCostLabel.string = state.hasPendingSpeedUpgrade
                ? `${state.nextSpeedUpgradeCost}`
                : 'MAX';
        }

        const enabled = state.hasPendingSpeedUpgrade
            && state.speedUpgradeReady
            && state.canAffordSpeedUpgrade;
        this._attendantEnabled = enabled;
        if (this.attendantOverlay) this.attendantOverlay.active = !enabled;
        if (enabled) this.startBounce('attendant');
        else this.stopBounce('attendant');
    }

    private refreshFake(state: UpgradePanelState): void {
        // Fake button: chỉ cần đủ tiền – không phụ thuộc pump / speed đã unlock hay chưa.
        const enabled = state.canAffordFake;
        this._fakeEnabled = enabled;

        if (this.fakeCostLabel) {
            this.fakeCostLabel.string = state.fakeCost > 0 ? `${state.fakeCost}` : '';
        }
        if (this.fakeOverlay) this.fakeOverlay.active = !enabled;
        if (enabled) this.startBounce('fake');
        else this.stopBounce('fake');
    }

    private bindButton(target: Node, kind: 'slot' | 'attendant' | 'fake'): void {
        if (!target) return;

        // Nếu editor đã gắn Button + clickEvents thì tôn trọng thứ đó.
        const button = target.getComponent(Button);
        if (button && button.clickEvents.length > 0) return;

        const onStart = (e: EventTouch) => {
            this.setTouchInside(kind, true);
            e.propagationStopped = true;
        };
        const onEnd = (e: EventTouch) => {
            const wasInside = this.getTouchInside(kind);
            this.setTouchInside(kind, false);
            e.propagationStopped = true;
            if (wasInside) this.dispatchClick(kind);
        };
        const onCancel = () => this.setTouchInside(kind, false);

        target.off(Node.EventType.TOUCH_START, onStart, this);
        target.off(Node.EventType.TOUCH_END, onEnd, this);
        target.off(Node.EventType.TOUCH_CANCEL, onCancel, this);

        target.on(Node.EventType.TOUCH_START, onStart, this);
        target.on(Node.EventType.TOUCH_END, onEnd, this);
        target.on(Node.EventType.TOUCH_CANCEL, onCancel, this);
    }

    private setTouchInside(kind: 'slot' | 'attendant' | 'fake', value: boolean): void {
        if (kind === 'slot') this._touchInsideSlot = value;
        else if (kind === 'attendant') this._touchInsideAttendant = value;
        else this._touchInsideFake = value;
    }

    private getTouchInside(kind: 'slot' | 'attendant' | 'fake'): boolean {
        if (kind === 'slot') return this._touchInsideSlot;
        if (kind === 'attendant') return this._touchInsideAttendant;
        return this._touchInsideFake;
    }

    private dispatchClick(kind: 'slot' | 'attendant' | 'fake'): void {
        if (kind === 'slot') {
            if (!this._slotEnabled) return;
            this._onSlotClick?.();
            this.punchTapTarget(kind);
        } else if (kind === 'attendant') {
            if (!this._attendantEnabled) return;
            this._onAttendantClick?.();
            this.punchTapTarget(kind);
        } else {
            if (!this._fakeEnabled) return;
            this._onFakeClick?.();
            this.punchTapTarget(kind);
        }
    }

    private punchTapTarget(kind: 'slot' | 'attendant' | 'fake'): void {
        const target = this.getBounceTarget(kind);
        if (!target) return;
        const base = this.getBaseScale(kind);
        const punched = new Vec3(base.x * 0.9, base.y * 0.9, base.z);

        // Tạm dừng ambient loop để tránh conflict với punch tween; re-arm sau
        // nếu button vẫn enabled (đủ tiền, còn pending).
        this.stopBounce(kind);
        target.setScale(base);
        tween(target)
            .to(0.06, { scale: punched }, { easing: 'quadOut' })
            .to(0.14, { scale: base }, { easing: 'backOut' })
            .call(() => {
                if (this.isEnabled(kind)) this.startBounce(kind);
            })
            .start();
    }

    private isEnabled(kind: 'slot' | 'attendant' | 'fake'): boolean {
        if (kind === 'slot') return this._slotEnabled;
        if (kind === 'attendant') return this._attendantEnabled;
        return this._fakeEnabled;
    }


    private startBounce(kind: 'slot' | 'attendant' | 'fake'): void {
        this.stopBounce(kind);
        const target = this.getBounceTarget(kind);
        if (!target) return;
        const base = this.getBaseScale(kind);
        const big = new Vec3(base.x * 1.05, base.y * 1.05, base.z);
        target.setScale(base);
        const t = tween(target)
            .repeatForever(
                tween(target)
                    .to(0.35, { scale: big }, { easing: 'sineOut' })
                    .to(0.35, { scale: base }, { easing: 'sineInOut' })
                    .delay(0.18),
            )
            .start();
        if (kind === 'slot') this._slotBounce = t;
        else if (kind === 'attendant') this._attendantBounce = t;
        else this._fakeBounce = t;
    }

    private stopBounce(kind: 'slot' | 'attendant' | 'fake'): void {
        const current = kind === 'slot'
            ? this._slotBounce
            : kind === 'attendant'
                ? this._attendantBounce
                : this._fakeBounce;
        if (current) {
            current.stop();
            if (kind === 'slot') this._slotBounce = null;
            else if (kind === 'attendant') this._attendantBounce = null;
            else this._fakeBounce = null;
        }
        const target = this.getBounceTarget(kind);
        if (target) target.setScale(this.getBaseScale(kind));
    }

    private getBounceTarget(kind: 'slot' | 'attendant' | 'fake'): Node | null {
        if (kind === 'slot') return this.slotTapTarget ?? null;
        if (kind === 'attendant') return this.attendantTapTarget ?? null;
        return this.fakeTapTarget ?? null;
    }

    private getBaseScale(kind: 'slot' | 'attendant' | 'fake'): Vec3 {
        const cached = kind === 'slot'
            ? this._slotBaseScale
            : kind === 'attendant'
                ? this._attendantBaseScale
                : this._fakeBaseScale;
        if (cached) return cached.clone();

        const target = this.getBounceTarget(kind);
        const scale = target ? target.scale.clone() : new Vec3(1, 1, 1);
        if (kind === 'slot') this._slotBaseScale = scale;
        else if (kind === 'attendant') this._attendantBaseScale = scale;
        else this._fakeBaseScale = scale;
        return scale.clone();
    }

}
