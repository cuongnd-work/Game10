import { _decorator, Component, Node } from 'cc';
import { GAME_CONFIG, GAME_RUNTIME, resetGameRuntime } from 'db://assets/Src/Core/GameConfig';
import { UpgradePanel, UpgradePanelState } from 'db://assets/Src/Core/UpgradePanel';
import { Slot } from 'db://assets/Src/Gameplay/Slot';

const { ccclass, property } = _decorator;

@ccclass('GasStation')
export class GasStation extends Component {
    @property([Slot])
    slots: Slot[] = [];

    @property(UpgradePanel)
    upgradePanel: UpgradePanel = null!;

    private _getMoney: (() => number) | null = null;
    private _trySpendMoney: ((amount: number) => boolean) | null = null;
    private _showWarning: (() => void) | null = null;
    private _onPumpUnlocked: ((slot: Slot) => void) | null = null;
    private _onAttendantUnlocked: ((slot: Slot) => void) | null = null;
    private _onSpeedUpgraded: ((level: number, duration: number) => void) | null = null;
    private _onFakeButton: (() => void) | null = null;
    private _onUpgradeTap: (() => void) | null = null;

    protected onLoad(): void {
        this.slots.sort((a, b) => a.slotIndex - b.slotIndex);

        // Speed level luôn reset về 0 mỗi lần scene load – tránh giữ state cũ giữa các session.
        resetGameRuntime();

        // Popup per-slot luôn ẩn – toàn bộ tương tác chạy qua UpgradePanel.
        for (const slot of this.slots) {
            slot.onPumpUpgradeRequested = () => this.tryUpgradeNextPump();
            slot.onAttendantTapRequested = () => this.tryUpgradeSpeed();
            slot.onFinalCTARequested = () => this._onFakeButton?.();
            slot.onPumpUpgradeUIShown = null;
            slot.onAttendantUpgradeUIShown = null;
            slot.onCarArrivedAtPump = () => this.refreshUpgradeUI();
        }
    }

    configureUpgrade(
        getMoney: () => number,
        trySpendMoney: (amount: number) => boolean,
        showWarning: () => void,
        onPumpUnlocked: (slot: Slot) => void,
        onAttendantUnlocked: (slot: Slot) => void,
        onFakeButton: () => void,
        onUpgradeTap?: () => void,
        onSpeedUpgraded?: (level: number, duration: number) => void,
    ): void {
        this._getMoney = getMoney;
        this._trySpendMoney = trySpendMoney;
        this._showWarning = showWarning;
        this._onPumpUnlocked = onPumpUnlocked;
        this._onAttendantUnlocked = onAttendantUnlocked;
        this._onFakeButton = onFakeButton;
        this._onUpgradeTap = onUpgradeTap ?? null;
        this._onSpeedUpgraded = onSpeedUpgraded ?? null;

        this.upgradePanel?.configure(
            () => this.tryUpgradeNextPump(),
            () => this.tryUpgradeSpeed(),
            () => this._onFakeButton?.(),
        );

        this.refreshUpgradeUI();
    }

    getFreeSlotForCar(): Slot | null {
        for (const slot of this.slots) {
            if (slot.isFreeForCar) return slot;
        }
        return null;
    }

    getSlotAt(index: number): Slot | null {
        return this.slots[index] ?? null;
    }

    pumpUnlockedCount(): number {
        return this.slots.filter((slot) => slot.pumpUnlocked).length;
    }

    attendantUnlockedCount(): number {
        return this.slots.filter((slot) => slot.attendantUnlocked).length;
    }

    unlockedCount(): number { return this.pumpUnlockedCount(); }

    getNextLockedPumpSlot(): Slot | null {
        for (const slot of this.slots) {
            if (!slot.pumpUnlocked) return slot;
        }
        return null;
    }

    /** Attendant kế tiếp cần unlock (bất kể pump slot đó đã mở chưa). */
    getNextLockedAttendantSlot(): Slot | null {
        for (const slot of this.slots) {
            if (!slot.attendantUnlocked) return slot;
        }
        return null;
    }

    allPumpsUnlocked(): boolean {
        return this.pumpUnlockedCount() >= this.slots.length;
    }

    allAttendantsUnlocked(): boolean {
        return this.attendantUnlockedCount() >= this.slots.length;
    }

    allFullyUnlocked(): boolean {
        return this.allPumpsUnlocked() && this.allAttendantsUnlocked();
    }

    hideAllUpgradeUI(): void {
        for (const slot of this.slots) {
            slot.hidePumpUpgradeUI();
            slot.hideAttendantUpgradeUI();
        }
        this.upgradePanel?.hideAll();
    }

    refreshUpgradeUI(): void {
        // Popup per-slot luôn ẩn – toàn bộ tương tác chạy qua UpgradePanel.
        for (const slot of this.slots) {
            slot.hidePumpUpgradeUI();
            slot.hideAttendantUpgradeUI();
        }

        if (!this.upgradePanel) return;
        // Visibility của từng tap target do tutorial stage (GameManager) quyết định –
        // ở đây chỉ update label/overlay/bounce theo state hiện tại.
        this.upgradePanel.refresh(this.buildPanelState());
    }

    /** Hint sequential cũ – giữ để tương thích nhưng GameManager không còn dùng. */
    getUpgradeHintTarget(): Node | null {
        if (!this.upgradePanel) return null;
        return this.upgradePanel.getHintTarget(this.buildPanelState());
    }

    getUpgradeSpotlightTarget(): Node | null {
        return null;
    }

    /** Snapshot state hiện tại để GameManager tự query. */
    getPanelState(): UpgradePanelState {
        return this.buildPanelState();
    }

    // ── Actions ──────────────────────────────────────────────────

    /**
     * Click từ slotTapTarget – unlock cả pump lẫn attendant của slot kế tiếp.
     * Attendant giờ đi kèm pump (không còn tap riêng).
     */
    tryUpgradeNextPump(): void {
        const slot = this.getNextLockedPumpSlot();
        if (!slot) return;

        const cost = this.costForSlot(slot.slotIndex);
        if (!(this._trySpendMoney?.(cost) ?? false)) {
            this._showWarning?.();
            return;
        }

        this._onUpgradeTap?.();

        slot.unlockPump();
        slot.hidePumpUpgradeUI();
        this._onPumpUnlocked?.(slot);

        if (!slot.attendantUnlocked) {
            slot.unlockAttendant();
            slot.hideAttendantUpgradeUI();
            this._onAttendantUnlocked?.(slot);
        }

        this.refreshUpgradeUI();
    }

    /**
     * Click từ speed upgrade button (attendantTapTarget) – bump speed level lên 1
     * mốc, cập nhật GAME_RUNTIME.refuelDuration cho tất cả cây xăng (kể cả cây
     * chưa mở → khi mở sau đã tự khớp speed hiện tại).
     */
    tryUpgradeSpeed(): void {
        const nextLevel = GAME_RUNTIME.speedLevel + 1;
        const durations = GAME_CONFIG.REFUEL_DURATION_LEVELS;
        const maxUpgrades = this.getMaxSpeedUpgrades();
        if (nextLevel > maxUpgrades) return;
        if (this.pumpUnlockedCount() <= 0) return;

        const cost = GAME_CONFIG.SPEED_UPGRADE_COSTS[nextLevel - 1] ?? 0;
        if (!(this._trySpendMoney?.(cost) ?? false)) {
            this._showWarning?.();
            return;
        }

        this._onUpgradeTap?.();

        GAME_RUNTIME.speedLevel = nextLevel;
        GAME_RUNTIME.refuelDuration = durations[nextLevel];

        // Trên mỗi slot đã mở: play "appear" fx (reuse unlockAttendantEffect)
        // + bật bubble "Speed++" trên đầu attendant.
        for (const slot of this.slots) {
            if (!slot.pumpUnlocked) continue;
            slot.playAppearEffect();
            slot.attendant?.playSpeedBubble();
        }
        this._onSpeedUpgraded?.(nextLevel, GAME_RUNTIME.refuelDuration);

        this.refreshUpgradeUI();
    }

    // ── Internal ─────────────────────────────────────────────────

    private buildPanelState(): UpgradePanelState {
        const money = this._getMoney?.() ?? 0;
        const nextPumpSlot = this.getNextLockedPumpSlot();

        const nextPumpCost = nextPumpSlot
            ? this.costForSlot(nextPumpSlot.slotIndex)
            : 0;

        const maxUpgrades = this.getMaxSpeedUpgrades();
        const nextSpeedIndex = GAME_RUNTIME.speedLevel; // index vào SPEED_UPGRADE_COSTS
        const hasPendingSpeed = GAME_RUNTIME.speedLevel < maxUpgrades;
        const nextSpeedCost = hasPendingSpeed
            ? (GAME_CONFIG.SPEED_UPGRADE_COSTS[nextSpeedIndex] ?? 0)
            : 0;
        const speedReady = this.pumpUnlockedCount() > 0;

        const fakeCost = GAME_CONFIG.FAKE_UNLOCK_COST ?? 0;

        return {
            hasPendingPump: !!nextPumpSlot,
            nextPumpCost,
            canAffordPump: !!nextPumpSlot && money >= nextPumpCost,

            hasPendingSpeedUpgrade: hasPendingSpeed,
            speedUpgradeReady: speedReady,
            nextSpeedUpgradeCost: nextSpeedCost,
            canAffordSpeedUpgrade: hasPendingSpeed && speedReady && money >= nextSpeedCost,

            fakeCost,
            canAffordFake: money >= fakeCost,
        };
    }

    /**
     * Số lần upgrade speed tối đa hợp lệ. Bị giới hạn bởi cả số cost đã config
     * lẫn số duration level còn lại (không thể nhảy quá LEVELS.length - 1).
     */
    private getMaxSpeedUpgrades(): number {
        const costs = GAME_CONFIG.SPEED_UPGRADE_COSTS.length;
        const remainingLevels = Math.max(0, GAME_CONFIG.REFUEL_DURATION_LEVELS.length - 1);
        return Math.min(costs, remainingLevels);
    }

    private costForSlot(index: number): number {
        return GAME_CONFIG.SLOT_UNLOCK_COSTS[index] ?? 0;
    }
}
