import { _decorator, Component, EventTouch, Input, input, Node, Vec3, view } from 'cc';
import { GAME_CONFIG } from 'db://assets/Src/Core/GameConfig';
import { UIManager } from 'db://assets/Src/Core/UIManager';
import { UpgradePanel } from 'db://assets/Src/Core/UpgradePanel';
import { AudioContainer } from 'db://assets/Src/Core/AudioContainer';
import { GasStation } from 'db://assets/Src/Gameplay/GasStation';
import { CarSpawner } from 'db://assets/Src/Gameplay/CarSpawner';
import { GiftBoxIntro } from 'db://assets/Src/Gameplay/GiftBoxIntro';
import { CoinEffect } from 'db://assets/Src/Effects/CoinEffect';
import { Slot } from 'db://assets/Src/Gameplay/Slot';
import super_html_playable from 'db://assets/plugins/playable-foundation/super-html/super_html_playable';
import { tracking_service } from 'db://assets/plugins/playable-foundation/tracking/tracking_service';
import { constant } from 'db://assets/configs/constant';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    @property(UIManager)
    uiManager: UIManager = null!;

    @property(CoinEffect)
    coinEffect: CoinEffect = null!;

    @property(GasStation)
    gasStation: GasStation = null!;

    @property(UpgradePanel)
    upgradePanel: UpgradePanel = null!;

    @property(CarSpawner)
    carSpawner: CarSpawner = null!;

    /** Bãi đất trống → hộp quà lắc → tap để hiện trạm. Optional. */
    @property(GiftBoxIntro)
    giftBoxIntro: GiftBoxIntro = null!;

    @property(Node)
    BGM: Node = null!;

    @property(Node)
    audioContainerNode: Node = null!;

    private _money: number = 0;
    private _upgradeFlowUnlocked: boolean = false;
    private _stationRevealed: boolean = false;
    private _trackingUnloadBound: boolean = false;
    private _trackingInputBound: boolean = false;
    private _trackingFirstInputCaptured: boolean = false;

    // 'attendant' = giai đoạn chỉ cursor sang button speed upgrade (giữ tên
    // legacy để không phá logic hint bên dưới).
    private _tutorialStage: 'init' | 'attendant' | 'free' = 'init';
    private _lastTapAt: number = 0;

    private _hornLoopActive: boolean = false;
    private _firstSlotTapped: boolean = false;
    private _lastCanAffordNextSlot: boolean = false;
    private _lastCanAffordFake: boolean = false;

    private get audio(): AudioContainer | null {
        return this.audioContainerNode?.getComponent(AudioContainer) ?? null;
    }

    protected onLoad(): void {
        // this.setupStore();
    }

    protected start(): void {
        this.setupTracking();

        if (this.gasStation) {
            if (this.upgradePanel && !this.gasStation.upgradePanel) {
                this.gasStation.upgradePanel = this.upgradePanel;
            }
            this.gasStation.configureUpgrade(
                () => this._money,
                (amount) => this.trySpendMoney(amount),
                () => {
                    tracking_service.trackInteraction('insufficient_funds');
                    this.uiManager?.showWarning();
                    this.audio?.playWarning();
                },
                (slot) => this.handlePumpUnlocked(slot),
                (slot) => this.handleAttendantUnlocked(slot),
                () => this.handleFakeUpgradeClicked(),
                () => this.audio?.playClick(),
                (level, duration) => this.handleSpeedUpgraded(level, duration),
            );
        }

        if (this.carSpawner) {
            this.carSpawner.onCarRefueled = (pos, slotIndex) => this.handleCarRefueled(pos, slotIndex);
            this.carSpawner.onCarRefuelStart = () => this.audio?.playRefueling();
            // this.carSpawner.onCarQueueBubble = () => this.audio?.playCarHorn();
            this.carSpawner.onInitialQueueReady = () => this.handleInitialQueueReady();
        }

        this.setupGiftBoxGating();
        this.updateMoney(GAME_CONFIG.INITIAL_MONEY);
        this.refreshHint();
        this.ensureHornLoop();
    }

    private setupGiftBoxGating(): void {
        if (!this.giftBoxIntro) {
            // Không có gift box trong scene → coi như đã reveal luôn.
            this._stationRevealed = true;
            return;
        }

        if (this.giftBoxIntro.isOpened) {
            this._stationRevealed = true;
            return;
        }

        // Gift box chỉ ẩn/hiện visual của trạm + upgrade UI.
        // Spawner vẫn chạy ngay từ đầu để xe sẵn sàng vào queue.
        this._stationRevealed = false;
        this.gasStation?.hideAllUpgradeUI();

        this.giftBoxIntro.onOpened = () => this.handleGiftBoxOpened();
    }

    private handleGiftBoxOpened(): void {
        if (this._stationRevealed) return;
        tracking_service.trackInteraction('gift_box_opened');
        this.audio?.playCollectCoin();

        // Ẩn hand-tap ngay khi tap gift → tránh nó còn trỏ vào gift đã biến mất.
        this.uiManager?.hideHint();

        const delay = Math.max(0, GAME_CONFIG.UPGRADE_UI_DELAY_AFTER_GIFT ?? 0);
        this.scheduleOnce(() => {
            if (this._stationRevealed) return;
            this._stationRevealed = true;
            this.syncUpgradeUI();
            // refreshHint sẽ point hand-tap sang button vừa hiện.
            this.refreshHint();
        }, delay);
    }

    private syncUpgradeUI(): void {
        if (this._upgradeFlowUnlocked && this._stationRevealed) {
            this.applyTutorialStageVisibility();
            this.gasStation?.refreshUpgradeUI();
        } else {
            this.gasStation?.hideAllUpgradeUI();
        }
    }

    private ensureHornLoop(): void {
        if (this._firstSlotTapped) return;
        if (this._hornLoopActive) return;
        this._hornLoopActive = true;
        // console.log('[GameManager] ensureHornLoop start – audio=', !!this.audio);
        this.audio?.playCarHorn();
        this.schedule(this.playHornTick, 3);
    }

    private playHornTick = (): void => {
        if (this._firstSlotTapped) {
            this.stopHornLoop();
            return;
        }
        this.audio?.playCarHorn();
    };

    private stopHornLoop(): void {
        this.unschedule(this.playHornTick);
        this._hornLoopActive = false;
    }

    /** Sau khi đã stop loop – phát horn mỗi khi tiền vừa đủ để unlock slot kế tiếp. */
    private checkAffordabilityHorn(): void {
        if (!this._firstSlotTapped) return;
        this.checkSlotAffordHorn();
        this.checkFakeAffordHorn();
    }

    private checkSlotAffordHorn(): void {
        const nextSlot = this.gasStation?.getNextLockedPumpSlot();
        if (!nextSlot) {
            this._lastCanAffordNextSlot = false;
            return;
        }
        const cost = GAME_CONFIG.SLOT_UNLOCK_COSTS[nextSlot.slotIndex] ?? 0;
        const canAfford = this._money >= cost;
        if (canAfford && !this._lastCanAffordNextSlot) {
            this.audio?.playCarHorn();
        }
        this._lastCanAffordNextSlot = canAfford;
    }

    private checkFakeAffordHorn(): void {
        // Chỉ có nghĩa khi fake button đã visible – tức toàn bộ pump + attendant đã unlock.
        if (!this.gasStation?.allFullyUnlocked()) {
            this._lastCanAffordFake = false;
            return;
        }
        const cost = GAME_CONFIG.FAKE_UNLOCK_COST ?? 0;
        const canAfford = this._money >= cost;
        if (canAfford && !this._lastCanAffordFake) {
            this.audio?.playCarHorn();
        }
        this._lastCanAffordFake = canAfford;
    }

    /** Bật/tắt tap target theo giai đoạn tutorial. */
    private applyTutorialStageVisibility(): void {
        if (!this.upgradePanel) return;
        if (this._tutorialStage === 'init') this.upgradePanel.showSlotOnly();
        else this.upgradePanel.showAll();
    }

    private setupStore(): void {
        super_html_playable.set_google_play_url(constant.STORE_LINK.ANDROID_LINK);
        super_html_playable.set_app_store_url(constant.STORE_LINK.IOS_LINK);
    }

    onPlayNowClicked(): void {
        this.goToStore('play_now');
    }

    private handleFakeUpgradeClicked(): void {
        this.audio?.playClick();
        this.goToStore('fake_upgrade');
    }

    private goToStore(source: string): void {
        tracking_service.trackStoreTrigger('cta_store', { source });
        tracking_service.end();
        super_html_playable.download();
        super_html_playable.game_end();
    }

    private handlePumpUnlocked(slot: Slot): void {
        tracking_service.trackInteraction('pump_unlocked', { slot_index: slot.slotIndex });
        this.audio?.playUnlock();
        this.notifyUserTapped();
        if (!this._firstSlotTapped) {
            this._firstSlotTapped = true;
            this.stopHornLoop();
        }
        // Slot vừa unlock → tracker về false, sau đó check để phát nếu vẫn đủ tiền
        // cho slot kế tiếp (edge false→true).
        this._lastCanAffordNextSlot = false;
        this.checkAffordabilityHorn();
        if (this._tutorialStage === 'init') {
            this._tutorialStage = 'attendant';
            this.applyTutorialStageVisibility();
        }
        this.refreshHint();
    }

    private handleAttendantUnlocked(slot: Slot): void {
        // Attendant giờ auto-unlock cùng pump – vẫn track/audio để giữ analytics,
        // nhưng KHÔNG chuyển tutorial stage ở đây (đợi speed upgrade thay thế).
        tracking_service.trackInteraction('attendant_unlocked', { slot_index: slot.slotIndex });
        this.refreshHint();
    }

    private handleSpeedUpgraded(level: number, duration: number): void {
        tracking_service.trackInteraction('speed_upgraded', {
            level,
            refuel_duration: duration,
        });
        this.audio?.playUnlock();
        this.notifyUserTapped();
        if (this._tutorialStage === 'attendant') {
            this._tutorialStage = 'free';
        }
        this.refreshHint();
    }

    /** Cập nhật thời điểm tap gần nhất; ở free stage – ẩn hint + rearm idle timer. */
    private notifyUserTapped(): void {
        this._lastTapAt = Date.now();
        if (this._tutorialStage === 'free') {
            this.uiManager?.hideHint();
            this.rearmIdleTimer();
        }
    }

    private rearmIdleTimer(): void {
        this.unschedule(this.onIdleFire);
        const interval = Math.max(0.1, GAME_CONFIG.HANDTAP_IDLE_INTERVAL ?? 5);
        this.scheduleOnce(this.onIdleFire, interval);
    }

    private onIdleFire = (): void => {
        // Idle threshold vượt qua → refreshHint sẽ tự tính highest-cost target.
        this.refreshHint();
    };

    private handleCarRefueled(carWorldPos: Vec3, _slotIndex: number): void {
        this.audio?.playCollectCoin();
        const amount = GAME_CONFIG.EARN_PER_REFUEL;
        this.coinEffect?.spawn(carWorldPos, amount, () => {
            this.updateMoney(this._money + amount);
            this.uiManager?.emphasizeMoneyGain();
        });
    }

    private handleInitialQueueReady(): void {
        if (this._upgradeFlowUnlocked) return;
        this._upgradeFlowUnlocked = true;
        this.syncUpgradeUI();
        this.refreshHint();
    }

    private updateMoney(newAmount: number): void {
        this._money = Math.max(0, newAmount);
        this.uiManager?.updateMoney(this._money);
        this.syncUpgradeUI();
        this.checkAffordabilityHorn();
        this.refreshHint();
    }

    private refreshHint(): void {
        if (!this.uiManager) return;

        // Gift box branch – dùng giftHandOffset riêng.
        if (this.giftBoxIntro && !this._stationRevealed) {
            if (!this.giftBoxIntro.isOpened && this.giftBoxIntro.giftBox) {
                this.uiManager.pointHintAt(this.giftBoxIntro.giftBox, null, 'gift');
            } else {
                this.uiManager.hideHint();
            }
            return;
        }

        if (!this._upgradeFlowUnlocked || !this._stationRevealed || !this.upgradePanel) {
            this.uiManager.hideHint();
            return;
        }

        const state = this.gasStation?.getPanelState() ?? null;

        // Tutorial 'init': hint vào slot button CHỈ KHI đủ tiền unlock pump kế tiếp.
        if (this._tutorialStage === 'init') {
            const canAfford = !!state && state.hasPendingPump && state.canAffordPump;
            const t = canAfford ? this.upgradePanel.getSlotHintTarget() : null;
            if (t) this.uiManager.pointHintAt(t, null, 'button');
            else this.uiManager.hideHint();
            return;
        }

        // Tutorial 'attendant' (speed upgrade): hint CHỈ KHI đủ tiền upgrade speed.
        if (this._tutorialStage === 'attendant') {
            const canAfford = !!state
                && state.hasPendingSpeedUpgrade
                && state.speedUpgradeReady
                && state.canAffordSpeedUpgrade;
            const t = canAfford ? this.upgradePanel.getAttendantHintTarget() : null;
            if (t) this.uiManager.pointHintAt(t, null, 'button');
            else this.uiManager.hideHint();
            return;
        }

        // 'free' stage:
        // - Nếu fake button đủ tiền → hint ngay lập tức, bỏ qua idle timer
        //   (không cần chờ pump / speed unlock hết).
        // - Ngược lại chỉ hint sau khi player idle >= HANDTAP_IDLE_INTERVAL.
        if (!!state && state.canAffordFake) {
            const t = this.upgradePanel.getFakeHintTarget();
            if (t) this.uiManager.pointHintAt(t, null, 'button');
            else this.uiManager.hideHint();
            return;
        }

        const elapsed = (Date.now() - this._lastTapAt) / 1000;
        const threshold = GAME_CONFIG.HANDTAP_IDLE_INTERVAL ?? 5;
        if (elapsed < threshold) {
            this.uiManager.hideHint();
            return;
        }

        // getHighestCostHintTarget đã tự lọc theo canAfford của từng button.
        const target = state ? this.upgradePanel.getHighestCostHintTarget(state) : null;
        if (target) this.uiManager.pointHintAt(target, null, 'button');
        else this.uiManager.hideHint();
    }

    private trySpendMoney(amount: number): boolean {
        if (this._money < amount) return false;
        this.updateMoney(this._money - amount);
        return true;
    }

    private setupTracking(): void {
        tracking_service.startSession();
        tracking_service.start();
        this.bindTrackingUnloadHandlers();
        this.bindTrackingInputHandlers();
    }

    private bindTrackingUnloadHandlers(): void {
        if (this._trackingUnloadBound) return;
        if (typeof window === 'undefined') return;
        this._trackingUnloadBound = true;

        const fireEnd = () => {
            try { tracking_service.end(); } catch { /* never crash on unload */ }
        };
        window.addEventListener('pagehide', fireEnd);
        window.addEventListener('beforeunload', fireEnd);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') fireEnd();
        });
    }

    /**
     * Global touch listener → record_hit (cho hit_map + raw interact count) và
     * first_input_time (mốc thời gian tap đầu tiên). Không cần scene attach
     * tracking_component riêng.
     */
    private bindTrackingInputHandlers(): void {
        if (this._trackingInputBound) return;
        this._trackingInputBound = true;
        input.on(Input.EventType.TOUCH_END, this.onTrackingTouch, this);
    }

    private onTrackingTouch = (e: EventTouch): void => {
        if (!this._trackingFirstInputCaptured) {
            this._trackingFirstInputCaptured = true;
            tracking_service.first_input_time();
        }
        const p = e.getUILocation();
        const size = view.getVisibleSize();
        const w = Math.max(1, size.width);
        const h = Math.max(1, size.height);
        const x = Math.max(0, Math.min(1, p.x / w));
        const y = Math.max(0, Math.min(1, p.y / h));
        tracking_service.record_hit(x, y);
    };

    protected onDestroy(): void {
        if (this._trackingInputBound) {
            input.off(Input.EventType.TOUCH_END, this.onTrackingTouch, this);
            this._trackingInputBound = false;
        }
        try { tracking_service.end(); } catch { /* ignore */ }
    }
}
