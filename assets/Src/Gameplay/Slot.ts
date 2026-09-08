import { _decorator, Button, Component, EventTouch, Node, Vec3, Label, Sprite, sp, tween, Tween } from 'cc';
import { Attendant } from 'db://assets/Src/Gameplay/Attendant';
import { Car } from 'db://assets/Src/Gameplay/Car';

const { ccclass, property } = _decorator;

@ccclass('Slot')
export class Slot extends Component {
    @property
    slotIndex: number = 0;

    @property(Node)
    pumpPoint: Node = null!;

    @property([Node])
    entryPath: Node[] = [];

    @property([Node])
    exitPath: Node[] = [];

    @property(Node)
    attendantSeat: Node = null!;

    @property(Attendant)
    attendant: Attendant = null!;

    /** Spine anim bật khi pump được unlock (open visual). Tự ẩn khi anim kết thúc. */
    @property({ type: [Node], tooltip: 'Spine node bật khi unlockPump; tự ẩn khi anim complete' })
    unlockEffects: Node[] = [];

    /** Spine anim bật khi attendant được unlock. Tự ẩn khi anim kết thúc. */
    @property({ type: [Node], tooltip: 'Spine node bật khi unlockAttendant; tự ẩn khi anim complete' })
    unlockAttendantEffect: Node[] = [];

    @property(Node)
    lockedVisual: Node = null!;

    @property({ type: [Node] })
    openVisuals: Node[] = [];

    // ── Pump upgrade UI (giá + click để mở cây xăng) ──────────────
    @property(Node)
    upgradeUI: Node = null!;

    @property(Node)
    bounceTarget: Node = null!;

    @property(Label)
    upgradeCostLabel: Label = null!;

    // ── Attendant popup (bấm N lần, mỗi lần trừ tiền + fill progress) ────
    /** Container popup nhân viên – dùng để show/hide toàn bộ. */
    @property(Node)
    attendantUpgradeUI: Node = null!;

    /**
     * Node NHẬN TAP thực sự (thường là nút bên trong popup).
     * Nếu để trống → fallback về attendantUpgradeUI.
     */
    @property(Node)
    attendantButton: Node = null!;

    @property(Node)
    attendantBounceTarget: Node = null!;

    /** Label hiện GIÁ TIỀN cho mỗi tap (giống pump upgrade label). */
    @property(Label)
    attendantClicksLabel: Label = null!;

    /** Sprite Filled/Radial – fillRange 0..1 theo tiến độ tap. */
    @property(Sprite)
    attendantProgressSprite: Sprite = null!;

    private _pumpUnlocked: boolean = false;
    private _attendantUnlocked: boolean = false;
    private _attendantClicks: number = 0;
    private _currentCar: Car | null = null;
    private _carArrivedAtPump: boolean = false;
    private _bounceTween: Tween<Node> | null = null;
    private _attendantBounceTween: Tween<Node> | null = null;
    private _finalCTAActive: boolean = false;
    private _bounceTargetBaseScale: Vec3 | null = null;
    private _attendantBounceTargetBaseScale: Vec3 | null = null;
    private _touchStartedInsidePump: boolean = false;
    private _touchStartedInsideAttendant: boolean = false;

    onPumpUpgradeRequested: ((slot: Slot) => void) | null = null;
    onAttendantTapRequested: ((slot: Slot) => void) | null = null;
    onFinalCTARequested: ((slot: Slot) => void) | null = null;
    onPumpUpgradeUIShown: ((slot: Slot) => void) | null = null;
    onAttendantUpgradeUIShown: ((slot: Slot) => void) | null = null;
    /** Bắn khi xe đã đi vào slot và dừng tại pump. */
    onCarArrivedAtPump: ((slot: Slot) => void) | null = null;

    get pumpUnlocked(): boolean { return this._pumpUnlocked; }
    get attendantUnlocked(): boolean { return this._attendantUnlocked; }
    /** Legacy alias – pump unlock = slot có thể tiếp nhận xe. */
    get slotUnlocked(): boolean { return this._pumpUnlocked; }
    get attendantClicks(): number { return this._attendantClicks; }
    get currentCar(): Car | null { return this._currentCar; }
    get isFreeForCar(): boolean { return this._pumpUnlocked && this._currentCar === null; }
    get carArrivedAtPump(): boolean { return this._carArrivedAtPump; }

    protected onLoad(): void {
        this.bindSceneReferences();
        this.bindPumpUpgradeButton();
        this.bindAttendantUpgradeButton();
        this.applyLockedVisual();
        this._hideAllEffects();
    }

    unlockPump(): void {
        if (this._pumpUnlocked) return;
        this._pumpUnlocked = true;
        this.applyLockedVisual();
        this._playEffectAnims(this.unlockEffects);
    }

    unlockAttendant(): void {
        if (this._attendantUnlocked) return;
        this._attendantUnlocked = true;
        this.applyLockedVisual();
        if (this._currentCar) {
            this._currentCar.notifyAttendantReady();
        }
        this._playEffectAnims(this.unlockAttendantEffect);
    }

    /**
     * Replay lại spine "appear" (unlockAttendantEffect) mà không đổi state –
     * dùng khi player upgrade speed để mỗi cây xăng đã mở đều nháy effect.
     */
    playAppearEffect(): void {
        this._playEffectAnims(this.unlockAttendantEffect);
    }

    private _playEffectAnims(nodes: Node[]): void {
        for (const node of nodes) {
            if (!node) continue;
            node.active = true;
            const sk = node.getComponent(sp.Skeleton) ?? node.getComponentInChildren(sp.Skeleton);
            if (!sk || !sk.defaultAnimation) continue;
            const entry = sk.setAnimation(0, sk.defaultAnimation, false);
            if (entry) {
                sk.setTrackCompleteListener(entry, () => {
                    node.active = false;
                });
            }
        }
    }

    private _hideAllEffects(): void {
        for (const n of this.unlockEffects) if (n) n.active = false;
        for (const n of this.unlockAttendantEffect) if (n) n.active = false;
    }

    /**
     * Ghi nhận 1 lần bấm vào popup nhân viên. Trả về số lần đã bấm hiện tại.
     * Không tự unlock — GasStation chịu trách nhiệm kiểm tra ngưỡng, thu tiền, và gọi unlockAttendant().
     */
    registerAttendantTap(): number {
        if (!this._pumpUnlocked) return this._attendantClicks;
        if (this._attendantUnlocked) return this._attendantClicks;
        this._attendantClicks += 1;
        return this._attendantClicks;
    }

    resetAttendantClicks(): void {
        this._attendantClicks = 0;
        // Flow mới: attendant auto unlock cùng pump nên progress ring luôn về 0/1.
        this.applyAttendantProgress(0, 1);
    }

    // ── Pump upgrade UI ──────────────────────────────────────────

    showPumpUpgradeUI(wantBounce: boolean, cost: number, textOverride?: string): void {
        this._finalCTAActive = false;
        if (this.upgradeCostLabel) {
            this.upgradeCostLabel.string = textOverride ?? (cost > 0 ? `${cost}` : '0');
        }
        if (!this.upgradeUI) return;
        const wasVisible = this.upgradeUI.active;
        this.upgradeUI.active = true;
        if (wantBounce) this.startPumpBounce();
        else this.stopPumpBounce();
        if (!wasVisible) this.onPumpUpgradeUIShown?.(this);
    }

    showFinalCTA(wantBounce: boolean): void {
        this._finalCTAActive = true;
        if (!this.upgradeUI) return;
        const wasVisible = this.upgradeUI.active;
        this.upgradeUI.active = true;
        if (wantBounce) this.startPumpBounce();
        else this.stopPumpBounce();
        if (!wasVisible) this.onPumpUpgradeUIShown?.(this);
    }

    hidePumpUpgradeUI(): void {
        this._finalCTAActive = false;
        this.stopPumpBounce();
        if (this.upgradeUI) this.upgradeUI.active = false;
    }

    // ── Attendant popup ──────────────────────────────────────────

    showAttendantUpgradeUI(
        wantBounce: boolean,
        clicksDone: number,
        clicksNeeded: number,
        costPerTap: number,
        textOverride?: string,
    ): void {
        if (!this.attendantUpgradeUI) return;
        this.updateAttendantCostLabel(costPerTap, textOverride);
        this.applyAttendantProgress(clicksDone, clicksNeeded);
        const wasVisible = this.attendantUpgradeUI.active;
        this.attendantUpgradeUI.active = true;
        if (wantBounce) this.startAttendantBounce();
        else this.stopAttendantBounce();
        if (!wasVisible) this.onAttendantUpgradeUIShown?.(this);
    }

    hideAttendantUpgradeUI(): void {
        this.stopAttendantBounce();
        if (this.attendantUpgradeUI) this.attendantUpgradeUI.active = false;
    }

    // ── Click handlers ───────────────────────────────────────────

    onPumpUpgradeClicked(): void {
        if (this._finalCTAActive) {
            this.onFinalCTARequested?.(this);
            return;
        }
        this.onPumpUpgradeRequested?.(this);
    }

    onAttendantUpgradeClicked(): void {
        this.onAttendantTapRequested?.(this);
    }

    // ── Car assignment ───────────────────────────────────────────

    assignCar(car: Car): void {
        this._currentCar = car;
        this._carArrivedAtPump = false;
    }
    freeCar(): void {
        this._currentCar = null;
        this._carArrivedAtPump = false;
    }

    notifyCarArrivedAtPump(): void {
        if (this._carArrivedAtPump) return;
        this._carArrivedAtPump = true;
        this.onCarArrivedAtPump?.(this);
    }

    getPumpWorldPos(): Vec3 {
        return this.pumpPoint
            ? this.pumpPoint.worldPosition.clone()
            : this.node.worldPosition.clone();
    }

    getEntryWaypointsWorld(): Vec3[] {
        const list = this.entryPath.map((node) => node.worldPosition.clone());
        list.push(this.getPumpWorldPos());
        return list;
    }

    getExitWaypointsWorld(): Vec3[] {
        return this.exitPath.map((node) => node.worldPosition.clone());
    }

    // ── Internal ─────────────────────────────────────────────────

    private updateAttendantCostLabel(costPerTap: number, textOverride?: string): void {
        if (!this.attendantClicksLabel) return;
        this.attendantClicksLabel.string = textOverride ?? (costPerTap > 0 ? `${costPerTap}` : '0');
    }

    private applyAttendantProgress(clicksDone: number, clicksNeeded: number): void {
        if (!this.attendantProgressSprite) return;
        const need = Math.max(1, clicksNeeded);
        const ratio = Math.max(0, Math.min(1, clicksDone / need));
        this.attendantProgressSprite.fillRange = ratio;
    }

    private applyLockedVisual(): void {
        if (this.lockedVisual) this.lockedVisual.active = !this._pumpUnlocked;
        for (const node of this.openVisuals) {
            if (node) node.active = this._pumpUnlocked;
        }
        if (this.attendant) this.attendant.node.active = this._attendantUnlocked;
    }

    private bindSceneReferences(): void {
        if (!this.attendant) {
            this.attendant = this.getComponentInChildren(Attendant);
        }
    }

    private bindPumpUpgradeButton(): void {
        if (!this.upgradeUI) return;

        const button = this.upgradeUI.getComponent(Button);
        if (button && button.clickEvents.length > 0) return;

        this.upgradeUI.off(Node.EventType.TOUCH_START, this.onPumpTouchStart, this);
        this.upgradeUI.off(Node.EventType.TOUCH_END, this.onPumpTouchEnd, this);
        this.upgradeUI.off(Node.EventType.TOUCH_CANCEL, this.onPumpTouchCancel, this);

        this.upgradeUI.on(Node.EventType.TOUCH_START, this.onPumpTouchStart, this);
        this.upgradeUI.on(Node.EventType.TOUCH_END, this.onPumpTouchEnd, this);
        this.upgradeUI.on(Node.EventType.TOUCH_CANCEL, this.onPumpTouchCancel, this);
    }

    private bindAttendantUpgradeButton(): void {
        const target = this.attendantButton ?? this.attendantUpgradeUI;
        if (!target) return;

        const button = target.getComponent(Button);
        if (button && button.clickEvents.length > 0) return;

        target.off(Node.EventType.TOUCH_START, this.onAttendantTouchStart, this);
        target.off(Node.EventType.TOUCH_END, this.onAttendantTouchEnd, this);
        target.off(Node.EventType.TOUCH_CANCEL, this.onAttendantTouchCancel, this);

        target.on(Node.EventType.TOUCH_START, this.onAttendantTouchStart, this);
        target.on(Node.EventType.TOUCH_END, this.onAttendantTouchEnd, this);
        target.on(Node.EventType.TOUCH_CANCEL, this.onAttendantTouchCancel, this);
    }

    private onPumpTouchStart(event: EventTouch): void {
        this._touchStartedInsidePump = true;
        event.propagationStopped = true;
    }

    private onPumpTouchEnd(event: EventTouch): void {
        const wasInside = this._touchStartedInsidePump;
        this._touchStartedInsidePump = false;
        event.propagationStopped = true;
        if (wasInside) this.onPumpUpgradeClicked();
    }

    private onPumpTouchCancel(): void {
        this._touchStartedInsidePump = false;
    }

    private onAttendantTouchStart(event: EventTouch): void {
        this._touchStartedInsideAttendant = true;
        event.propagationStopped = true;
    }

    private onAttendantTouchEnd(event: EventTouch): void {
        const wasInside = this._touchStartedInsideAttendant;
        this._touchStartedInsideAttendant = false;
        event.propagationStopped = true;
        if (wasInside) this.onAttendantUpgradeClicked();
    }

    private onAttendantTouchCancel(): void {
        this._touchStartedInsideAttendant = false;
    }

    private startPumpBounce(): void {
        this.stopPumpBounce();
        const target = this.getPumpBounceTarget();
        if (!target) return;
        const scale = this.getPumpBounceBaseScale();
        const big = new Vec3(scale.x * 1.035, scale.y * 1.035, scale.z);
        target.setScale(scale);
        this._bounceTween = tween(target)
            .repeatForever(
                tween(target)
                    .to(0.38, { scale: big }, { easing: 'sineOut' })
                    .to(0.38, { scale }, { easing: 'sineInOut' })
                    .delay(0.2),
            )
            .start();
    }

    private stopPumpBounce(): void {
        if (this._bounceTween) {
            this._bounceTween.stop();
            this._bounceTween = null;
        }
        const target = this.getPumpBounceTarget();
        if (target) target.setScale(this.getPumpBounceBaseScale());
    }

    private startAttendantBounce(): void {
        this.stopAttendantBounce();
        const target = this.getAttendantBounceTarget();
        if (!target) return;
        const scale = this.getAttendantBounceBaseScale();
        const big = new Vec3(scale.x * 1.05, scale.y * 1.05, scale.z);
        target.setScale(scale);
        this._attendantBounceTween = tween(target)
            .repeatForever(
                tween(target)
                    .to(0.32, { scale: big }, { easing: 'sineOut' })
                    .to(0.32, { scale }, { easing: 'sineInOut' })
                    .delay(0.15),
            )
            .start();
    }

    private stopAttendantBounce(): void {
        if (this._attendantBounceTween) {
            this._attendantBounceTween.stop();
            this._attendantBounceTween = null;
        }
        const target = this.getAttendantBounceTarget();
        if (target) target.setScale(this.getAttendantBounceBaseScale());
    }

    private getPumpBounceBaseScale(): Vec3 {
        if (!this._bounceTargetBaseScale) {
            const target = this.getPumpBounceTarget();
            this._bounceTargetBaseScale = target
                ? target.scale.clone()
                : new Vec3(1, 1, 1);
        }
        return this._bounceTargetBaseScale.clone();
    }

    private getAttendantBounceBaseScale(): Vec3 {
        if (!this._attendantBounceTargetBaseScale) {
            const target = this.getAttendantBounceTarget();
            this._attendantBounceTargetBaseScale = target
                ? target.scale.clone()
                : new Vec3(1, 1, 1);
        }
        return this._attendantBounceTargetBaseScale.clone();
    }

    private getPumpBounceTarget(): Node | null {
        return this.upgradeUI ?? this.bounceTarget ?? null;
    }

    private getAttendantBounceTarget(): Node | null {
        return this.attendantBounceTarget ?? this.attendantUpgradeUI ?? null;
    }
}
