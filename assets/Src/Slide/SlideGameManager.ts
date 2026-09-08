import { _decorator, Component, instantiate, Node, Prefab, tween, UIOpacity, Vec3 } from 'cc';
import { SLIDE_CONFIG } from 'db://assets/Src/Slide/SlideConfig';
import { SlideField } from 'db://assets/Src/Slide/SlideField';
import { SlideGame } from 'db://assets/Src/Slide/SlideGame';
import { SlideUpgradePanel } from 'db://assets/Src/Slide/SlideUpgradePanel';
import { UIManager } from 'db://assets/Src/Core/UIManager';
import { AudioContainer } from 'db://assets/Src/Core/AudioContainer';
import { CoinEffect } from 'db://assets/Src/Effects/CoinEffect';
import super_html_playable from 'db://assets/plugins/playable-foundation/super-html/super_html_playable';
import { tracking_service } from 'db://assets/plugins/playable-foundation/tracking/tracking_service';
import { constant } from 'db://assets/configs/constant';

const { ccclass, property } = _decorator;

/** 'tutorial' → 3 nút + text "UPGRADE IT!" | 'free' → 3 nút | 'end' → chỉ nút NEXT RIDE! */
type SlideStage = 'tutorial' | 'free' | 'end';

/**
 * SlideGameManager – lớp wiring duy nhất của Slide Game. Giữ số dư, state
 * tutorial, chính sách hint và CTA store; bơm hành vi xuống subsystem bằng
 * callback thuần (không event bus – đúng pattern của GameManager cũ).
 *
 * TRACKING: vòng đời session (startSession/start/hit-map/end) do node
 * `LifecycleManager` trong scene lo — `tracking_component` +
 * `tracking_global_listener`. Ở đây chỉ bắn event nghiệp vụ
 * (trackInteraction / trackStoreTrigger). KHÔNG tự bind lại touch/unload:
 * `startSession()` và `record_hit()` không chống gọi trùng, gọi 2 nơi là
 * mỗi tap bị đếm 2 lần và event "start" bị bắn 2 lần.
 */
@ccclass('SlideGameManager')
export class SlideGameManager extends Component {
    @property(UIManager)
    uiManager: UIManager = null!;

    @property(CoinEffect)
    coinEffect: CoinEffect = null!;

    @property(SlideGame)
    slideGame: SlideGame = null!;

    @property(SlideUpgradePanel)
    upgradePanel: SlideUpgradePanel = null!;

    @property(SlideField)
    field: SlideField = null!;

    @property(Node)
    audioContainerNode: Node = null!;

    @property(Prefab)
    upgradeEffectPrefab: Prefab = null!;

    @property({ type: Prefab, tooltip: 'Firework VFX phát tại làn vừa mở.' })
    laneUpgradeEffectPrefab: Prefab = null!;

    @property(Node)
    effectLayer: Node = null!;

    private _money: number = 0;
    private _stage: SlideStage = 'tutorial';
    private _lastTapAt: number = 0;
    /** Target hand-pointer đang hiển thị – tránh restart animation mỗi lần tiền đổi. */
    private _hintTarget: Node | null = null;

    private get audio(): AudioContainer | null {
        return this.audioContainerNode?.getComponent(AudioContainer) ?? null;
    }

    protected onLoad(): void {
        this.setupStore();
    }

    protected start(): void {
        if (this.slideGame) {
            if (this.upgradePanel && !this.slideGame.panel) {
                this.slideGame.panel = this.upgradePanel;
            }
            if (this.field && !this.slideGame.field) {
                this.slideGame.field = this.field;
            }
            this.slideGame.configureUpgrade(
                () => this._money,
                (amount) => this.trySpendMoney(amount),
                () => this.handleInsufficientFunds(),
                (level, duration) => this.handleSpeedUpgraded(level, duration),
                (laneCount) => this.handleLaneAdded(laneCount),
                (level) => this.handleLevelUp(level),
                () => this.handleCTAClicked(),
                () => this.audio?.playClick(),
            );
        }

        if (this.field) {
            this.field.onRideCompleted = (worldPos) => this.handleRideCompleted(worldPos);
            // this.field.onSlideStarted = () => this.audio?.play<SFX trượt>();
        }

        this._stage = 'tutorial';
        this.upgradePanel?.showTutorial();
        this.updateMoney(SLIDE_CONFIG.INITIAL_MONEY);
    }

    // ── Tiền ─────────────────────────────────────────────────────

    private handleRideCompleted(worldPos: Vec3): void {
        this.audio?.playCollectCoin();
        const amount = SLIDE_CONFIG.EARN_PER_RIDE;
        this.coinEffect?.spawn(worldPos, amount, () => {
            this.updateMoney(this._money + amount);
            this.uiManager?.emphasizeMoneyGain();
        });
    }

    private updateMoney(newAmount: number): void {
        this._money = Math.max(0, newAmount);
        this.uiManager?.updateMoney(this._money);
        this.slideGame?.refreshUpgradeUI();
        this.checkEndScene();
        this.refreshHint();
    }

    private trySpendMoney(amount: number): boolean {
        if (this._money < amount) return false;
        this.updateMoney(this._money - amount);
        return true;
    }

    private handleInsufficientFunds(): void {
        tracking_service.trackInteraction('insufficient_funds');
        this.uiManager?.showWarning();
        this.audio?.playWarning();
    }

    // ── Upgrade callbacks ────────────────────────────────────────

    private handleSpeedUpgraded(level: number, duration: number): void {
        tracking_service.trackInteraction('speed_upgraded', { level, slide_duration: duration });
        this.audio?.playUnlock();
        this.playUpgradeEffect(this.field?.node.worldPosition ?? this.node.worldPosition, 1.15);
        this.afterUpgrade();
    }

    private handleLaneAdded(laneCount: number): void {
        tracking_service.trackInteraction('lane_added', { lane_count: laneCount });
        this.audio?.playUnlock();
        this.playLaneUpgradeEffect(
            this.field?.getLaneUpgradeWorldPos(laneCount) ?? this.node.worldPosition,
        );
        // Lượt trượt đầu tiên chỉ bắt đầu sau khi player bấm nút Slide.
        this.field?.startRides();
        this.afterUpgrade();
    }

    private handleLevelUp(level: number): void {
        tracking_service.trackInteraction('level_up', { level });
        this.audio?.playUnlock();
        this.playUpgradeEffect(this.field?.node.worldPosition ?? this.node.worldPosition, 1.35);
        this.afterUpgrade();
    }

    /** Hiệu ứng sao dùng chung cho Speed / thêm làn / Lv Up, tự huỷ sau một nhịp. */
    private playUpgradeEffect(worldPos: Vec3, scale: number): void {
        if (!this.upgradeEffectPrefab || !this.effectLayer) return;

        const effect = instantiate(this.upgradeEffectPrefab);
        effect.parent = this.effectLayer;
        effect.worldPosition = new Vec3(worldPos.x, worldPos.y + 80, worldPos.z);
        effect.setScale(scale, scale, 1);

        const opacity = effect.getComponent(UIOpacity) ?? effect.addComponent(UIOpacity);
        opacity.opacity = 255;
        tween(effect)
            .delay(0.65)
            .to(0.25, { scale: new Vec3(scale * 1.12, scale * 1.12, 1) }, { easing: 'sineOut' })
            .call(() => effect.destroy())
            .start();
        tween(opacity)
            .delay(0.65)
            .to(0.25, { opacity: 0 }, { easing: 'quadIn' })
            .start();
    }

    /** Firework riêng cho thao tác thêm làn; prefab particle đang để loop. */
    private playLaneUpgradeEffect(worldPos: Vec3): void {
        if (!this.laneUpgradeEffectPrefab || !this.effectLayer) return;

        const effect = instantiate(this.laneUpgradeEffectPrefab);
        effect.parent = this.effectLayer;
        effect.worldPosition = new Vec3(worldPos.x, worldPos.y + 45, worldPos.z);
        this.setLayerRecursively(effect, this.effectLayer.layer);

        // Firework prefab chạy loop 1 giây; giữ thêm phần lifetime của hạt rồi hủy.
        this.scheduleOnce(() => {
            if (effect.isValid) effect.destroy();
        }, 1.8);
    }

    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursively(child, layer);
    }

    /**
     * Chung cho cả 3 loại upgrade. checkEndScene() phải chạy Ở ĐÂY chứ không chỉ
     * trong updateMoney(): lúc trừ tiền thì bộ đếm upgrade chưa tăng, nên lần
     * upgrade cuối cùng sẽ không bật end scene nếu chỉ dựa vào updateMoney.
     */
    private afterUpgrade(): void {
        this.leaveTutorial();
        this.notifyUserTapped();
        this.checkEndScene();
        this.refreshHint();
    }

    /**
     * Upgrade đầu tiên (bất kể loại nào) kết thúc tutorial. Cả 3 nút đã hiện
     * từ đầu nên ở đây chỉ còn việc tắt text "UPGRADE IT!" và chuyển sang
     * chính sách hint của stage 'free' (chỉ hiện khi idle đủ lâu).
     */
    private leaveTutorial(): void {
        if (this._stage !== 'tutorial') return;
        this._stage = 'free';
        this.upgradePanel?.showAll();
        this.slideGame?.refreshUpgradeUI();
    }

    private handleCTAClicked(): void {
        this.audio?.playClick();
        this.goToStore('next_ride');
    }

    /** Gọi từ Button "Play Now" trong scene. */
    onPlayNowClicked(): void {
        this.goToStore('play_now');
    }

    // ── End scene ────────────────────────────────────────────────

    private checkEndScene(): void {
        if (this._stage === 'end') return;
        if (!this.slideGame?.allMaxed()) return;

        this._stage = 'end';
        tracking_service.trackInteraction('all_upgrades_maxed');
        this.upgradePanel?.showEndCTA();
        this.unschedule(this.onIdleFire);
    }

    // ── Hint ─────────────────────────────────────────────────────

    private notifyUserTapped(): void {
        this._lastTapAt = Date.now();
        if (this._stage === 'free') {
            this.showHint(null);
            this.rearmIdleTimer();
        }
    }

    private rearmIdleTimer(): void {
        this.unschedule(this.onIdleFire);
        const interval = Math.max(0.1, SLIDE_CONFIG.IDLE_HINT_INTERVAL);
        this.scheduleOnce(this.onIdleFire, interval);
    }

    private onIdleFire = (): void => {
        this.refreshHint();
    };

    private refreshHint(): void {
        if (!this.uiManager || !this.upgradePanel) return;

        // Tutorial: pointer luôn trỏ nút Slide (INITIAL_MONEY đã đủ mua ngay).
        if (this._stage === 'tutorial') {
            this.showHint(this.upgradePanel.getLaneHintTarget());
            return;
        }

        // End scene: pointer trỏ NEXT RIDE!.
        if (this._stage === 'end') {
            this.showHint(this.upgradePanel.getCTAHintTarget());
            return;
        }

        // Free: chỉ hiện sau khi idle đủ lâu (spec mục 6).
        const elapsed = (Date.now() - this._lastTapAt) / 1000;
        if (elapsed < SLIDE_CONFIG.IDLE_HINT_INTERVAL) {
            this.showHint(null);
            return;
        }

        const state = this.slideGame?.getUpgradeState() ?? null;
        this.showHint(state ? this.upgradePanel.getIdleHintTarget(state) : null);
    }

    /**
     * Chỉ gọi CursorHint khi target THỰC SỰ đổi. refreshHint() chạy sau mỗi lượt
     * trượt (nhiều lần/giây khi đã mở 11 làn) mà pointAt() lại restart tween bounce
     * → không chặn thì bàn tay sẽ giật liên tục.
     */
    private showHint(target: Node | null): void {
        if (target === this._hintTarget) return;
        this._hintTarget = target;
        if (target) this.uiManager?.pointHintAt(target, null, 'button');
        else this.uiManager?.hideHint();
    }

    // ── Store / tracking ─────────────────────────────────────────

    private setupStore(): void {
        super_html_playable.set_google_play_url(constant.STORE_LINK.ANDROID_LINK);
        super_html_playable.set_app_store_url(constant.STORE_LINK.IOS_LINK);
    }

    private goToStore(source: string): void {
        tracking_service.trackStoreTrigger('cta_store', { source });
        tracking_service.end();
        super_html_playable.download();
        super_html_playable.game_end();
    }

}
