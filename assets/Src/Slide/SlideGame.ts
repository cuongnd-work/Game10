import { _decorator, Component } from 'cc';
import { SLIDE_CONFIG, SLIDE_RUNTIME, slideDurationForSpeedLevel } from 'db://assets/Src/Slide/SlideConfig';
import { SlideField } from 'db://assets/Src/Slide/SlideField';
import { SlideUpgradePanel, SlideUpgradeState } from 'db://assets/Src/Slide/SlideUpgradePanel';
import { UpgradeButtonState } from 'db://assets/Src/Slide/UpgradeButton';

const { ccclass, property } = _decorator;

/**
 * SlideGame – nắm luật kinh tế: quyết định mua được gì, thu tiền, và áp kết quả
 * xuống SlideField. KHÔNG giữ số dư (số dư nằm ở SlideGameManager) và không tự
 * biết tutorial đang ở đâu – toàn bộ visibility do manager điều khiển.
 */
@ccclass('SlideGame')
export class SlideGame extends Component {
    @property(SlideField)
    field: SlideField = null!;

    @property(SlideUpgradePanel)
    panel: SlideUpgradePanel = null!;

    private _getMoney: (() => number) | null = null;
    private _trySpendMoney: ((amount: number) => boolean) | null = null;
    private _showWarning: (() => void) | null = null;
    private _onUpgradeTap: (() => void) | null = null;
    private _onSpeedUpgraded: ((level: number, duration: number) => void) | null = null;
    private _onLaneAdded: ((laneCount: number) => void) | null = null;
    private _onLevelUp: ((level: number) => void) | null = null;
    private _onCTA: (() => void) | null = null;

    configureUpgrade(
        getMoney: () => number,
        trySpendMoney: (amount: number) => boolean,
        showWarning: () => void,
        onSpeedUpgraded: (level: number, duration: number) => void,
        onLaneAdded: (laneCount: number) => void,
        onLevelUp: (level: number) => void,
        onCTA: () => void,
        onUpgradeTap?: () => void,
    ): void {
        this._getMoney = getMoney;
        this._trySpendMoney = trySpendMoney;
        this._showWarning = showWarning;
        this._onSpeedUpgraded = onSpeedUpgraded;
        this._onLaneAdded = onLaneAdded;
        this._onLevelUp = onLevelUp;
        this._onCTA = onCTA;
        this._onUpgradeTap = onUpgradeTap ?? null;

        this.panel?.configure(
            () => this.tryUpgradeSpeed(),
            () => this.tryUpgradeLane(),
            () => this.tryUpgradeLevel(),
            () => this._onCTA?.(),
        );

        this.refreshUpgradeUI();
    }

    // ── Actions ──────────────────────────────────────────────────

    /** Speed: -15% thời gian trượt mỗi cấp, áp cho toàn bộ làn kể cả làn mở sau. */
    tryUpgradeSpeed(): void {
        if (SLIDE_RUNTIME.speedLevel >= SLIDE_CONFIG.SPEED_MAX_UPGRADES) return;
        if (!this.charge(SLIDE_CONFIG.SPEED_UPGRADE_COST)) return;

        SLIDE_RUNTIME.speedLevel += 1;
        SLIDE_RUNTIME.slideDuration = slideDurationForSpeedLevel(SLIDE_RUNTIME.speedLevel);

        this.field?.playSpeedBubbleOnCustomers();
        this._onSpeedUpgraded?.(SLIDE_RUNTIME.speedLevel, SLIDE_RUNTIME.slideDuration);
        this.refreshUpgradeUI();
    }

    /** Slide: thêm 1 làn trượt. */
    tryUpgradeLane(): void {
        if (SLIDE_RUNTIME.laneUpgrades >= SLIDE_CONFIG.LANE_MAX_UPGRADES) return;
        if (!this.charge(SLIDE_CONFIG.LANE_UPGRADE_COST)) return;

        SLIDE_RUNTIME.laneUpgrades += 1;
        const laneCount = SLIDE_CONFIG.BASE_LANE_COUNT + SLIDE_RUNTIME.laneUpgrades;

        this.field?.setLaneCount(laneCount);
        this._onLaneAdded?.(laneCount);
        this.refreshUpgradeUI();
    }

    /** Lv Up: đổi bố cục cầu trượt + reset toàn bộ khách (spec 4.3). */
    tryUpgradeLevel(): void {
        if (SLIDE_RUNTIME.levelUpgrades >= SLIDE_CONFIG.LEVEL_MAX_UPGRADES) return;
        if (!this.charge(SLIDE_CONFIG.LEVEL_UPGRADE_COST)) return;

        SLIDE_RUNTIME.levelUpgrades += 1;
        const level = SLIDE_CONFIG.BASE_SLIDE_LEVEL + SLIDE_RUNTIME.levelUpgrades;

        this.field?.setLevel(level);
        this._onLevelUp?.(level);
        this.refreshUpgradeUI();
    }

    // ── State ────────────────────────────────────────────────────

    getUpgradeState(): SlideUpgradeState {
        const money = this._getMoney?.() ?? 0;

        const speed = this.buildButtonState(
            SLIDE_RUNTIME.speedLevel,
            SLIDE_CONFIG.SPEED_MAX_UPGRADES,
            SLIDE_CONFIG.SPEED_UPGRADE_COST,
            money,
        );
        const lane = this.buildButtonState(
            SLIDE_RUNTIME.laneUpgrades,
            SLIDE_CONFIG.LANE_MAX_UPGRADES,
            SLIDE_CONFIG.LANE_UPGRADE_COST,
            money,
        );
        const level = this.buildButtonState(
            SLIDE_RUNTIME.levelUpgrades,
            SLIDE_CONFIG.LEVEL_MAX_UPGRADES,
            SLIDE_CONFIG.LEVEL_UPGRADE_COST,
            money,
        );

        return {
            speed,
            lane,
            level,
            allMaxed: speed.isMax && lane.isMax && level.isMax,
        };
    }

    refreshUpgradeUI(): void {
        this.panel?.refresh(this.getUpgradeState());
    }

    allMaxed(): boolean {
        return this.getUpgradeState().allMaxed;
    }

    // ── Internal ─────────────────────────────────────────────────

    /** Trừ tiền; thiếu thì bắn cảnh báo và trả false. */
    private charge(cost: number): boolean {
        if (!(this._trySpendMoney?.(cost) ?? false)) {
            this._showWarning?.();
            return false;
        }
        this._onUpgradeTap?.();
        return true;
    }

    private buildButtonState(
        level: number,
        max: number,
        cost: number,
        money: number,
    ): UpgradeButtonState {
        const isMax = level >= max;
        return {
            level,
            max,
            cost: isMax ? 0 : cost,
            canAfford: !isMax && money >= cost,
            isMax,
        };
    }
}
