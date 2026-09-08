import { _decorator, Component, Node } from 'cc';
import { UpgradeButton, UpgradeButtonState } from 'db://assets/Src/Slide/UpgradeButton';

const { ccclass, property } = _decorator;

/**
 * Snapshot toàn bộ state upgrade. Đây là contract duy nhất giữa
 * SlideGame ↔ SlideUpgradePanel ↔ SlideGameManager – muốn thêm thông tin thì
 * mở rộng interface này, đừng cho 3 bên tham chiếu chéo nhau.
 */
export interface SlideUpgradeState {
    speed: UpgradeButtonState;
    lane: UpgradeButtonState;
    level: UpgradeButtonState;
    /** Cả 3 trục đều đã MAX → vào end scene. */
    allMaxed: boolean;
}

/**
 * SlideUpgradePanel – HUD upgrade. Thứ tự hiển thị trái → phải:
 * Speed → Slide → Lv Up (do layout trong scene quyết định). Cả 3 nút hiện ngay
 * từ đầu; tutorial chỉ khác ở text "UPGRADE IT!" và hand pointer.
 * Khi cả 3 MAX thì ẩn hết và hiện 1 nút to "NEXT RIDE!".
 */
@ccclass('SlideUpgradePanel')
export class SlideUpgradePanel extends Component {
    @property(UpgradeButton)
    speedButton: UpgradeButton = null!;

    @property({ type: UpgradeButton, tooltip: 'Nút "Slide" – tăng số làn' })
    laneButton: UpgradeButton = null!;

    @property({ type: UpgradeButton, tooltip: 'Nút "Lv Up" – tăng level cầu trượt' })
    levelButton: UpgradeButton = null!;

    @property({ type: UpgradeButton, tooltip: 'Nút "NEXT RIDE!" ở end scene' })
    ctaButton: UpgradeButton = null!;

    @property({ type: Node, tooltip: 'Text "UPGRADE IT!" của tutorial' })
    tutorialText: Node = null!;

    /** State giả để CTA luôn ở dạng bấm được + bounce liên tục. */
    private static readonly CTA_STATE: UpgradeButtonState = {
        level: 0, max: 1, cost: 0, canAfford: true, isMax: false,
    };

    protected onLoad(): void {
        this.hideAll();
    }

    configure(
        onSpeed: () => void,
        onLane: () => void,
        onLevel: () => void,
        onCTA: () => void,
    ): void {
        if (this.speedButton) this.speedButton.onClick = onSpeed;
        if (this.laneButton) this.laneButton.onClick = onLane;
        if (this.levelButton) this.levelButton.onClick = onLevel;
        if (this.ctaButton) this.ctaButton.onClick = onCTA;
    }

    refresh(state: SlideUpgradeState): void {
        this.speedButton?.apply(state.speed);
        this.laneButton?.apply(state.lane);
        this.levelButton?.apply(state.level);
    }

    // ── Chuyển giai đoạn ─────────────────────────────────────────

    hideAll(): void {
        this.speedButton?.setVisible(false);
        this.laneButton?.setVisible(false);
        this.levelButton?.setVisible(false);
        this.ctaButton?.setVisible(false);
        if (this.tutorialText) this.tutorialText.active = false;
    }

    /**
     * Tutorial: đủ 3 nút ngay từ đầu + text "UPGRADE IT!". Hand pointer do
     * SlideGameManager trỏ vào nút Slide, nên vẫn dẫn được nước đi đầu tiên
     * mà không phải ẩn 2 nút còn lại.
     */
    showTutorial(): void {
        this.speedButton?.setVisible(true);
        this.laneButton?.setVisible(true);
        this.levelButton?.setVisible(true);
        this.ctaButton?.setVisible(false);
        if (this.tutorialText) this.tutorialText.active = true;
    }

    /** Sau tutorial: vẫn đủ 3 nút, bỏ text hướng dẫn. */
    showAll(): void {
        this.speedButton?.setVisible(true);
        this.laneButton?.setVisible(true);
        this.levelButton?.setVisible(true);
        this.ctaButton?.setVisible(false);
        if (this.tutorialText) this.tutorialText.active = false;
    }

    /** End scene: ẩn 3 nút upgrade, hiện NEXT RIDE! với bounce lặp. */
    showEndCTA(): void {
        this.speedButton?.setVisible(false);
        this.laneButton?.setVisible(false);
        this.levelButton?.setVisible(false);
        if (this.tutorialText) this.tutorialText.active = false;

        if (this.ctaButton) {
            this.ctaButton.setVisible(true);
            this.ctaButton.apply(SlideUpgradePanel.CTA_STATE);
        }
    }

    // ── Hint target ──────────────────────────────────────────────

    getLaneHintTarget(): Node | null {
        return this.laneButton?.getHintTarget() ?? null;
    }

    getCTAHintTarget(): Node | null {
        return this.ctaButton?.getHintTarget() ?? null;
    }

    /**
     * Nút "đang khả dụng" để trỏ hand pointer khi player idle (spec mục 6).
     * Trong nhóm đang hiện + đủ tiền, ưu tiên nút giá cao nhất.
     */
    getIdleHintTarget(state: SlideUpgradeState): Node | null {
        const candidates: Array<{ cost: number; target: Node | null }> = [];

        const push = (button: UpgradeButton, s: UpgradeButtonState) => {
            if (!button || !button.isVisible) return;
            if (s.isMax || !s.canAfford) return;
            candidates.push({ cost: s.cost, target: button.getHintTarget() });
        };

        push(this.speedButton, state.speed);
        push(this.laneButton, state.lane);
        push(this.levelButton, state.level);

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.cost - a.cost);
        return candidates[0].target;
    }
}
