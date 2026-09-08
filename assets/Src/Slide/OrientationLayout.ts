import { _decorator, Component, Enum, Node, UITransform, Vec2, Vec3, view } from 'cc';

const { ccclass, property, executeInEditMode, menu } = _decorator;

/** 9 điểm neo theo khung màn hình. */
export enum ScreenAnchor {
    TOP_LEFT = 0,
    TOP_CENTER = 1,
    TOP_RIGHT = 2,
    MIDDLE_LEFT = 3,
    CENTER = 4,
    MIDDLE_RIGHT = 5,
    BOTTOM_LEFT = 6,
    BOTTOM_CENTER = 7,
    BOTTOM_RIGHT = 8,
}
Enum(ScreenAnchor);

/**
 * OrientationLayout – đặt node theo neo + offset + scale riêng cho màn dọc và
 * màn ngang. Project để fitHeight (design 720x1280) nên khi xoay ngang chiều cao
 * hiển thị KHÔNG đổi, chỉ rộng ra rất nhiều → HUD phải dạt ra rìa và sân chơi
 * dịch sang một bên, chứ không phải scale nhỏ lại.
 *
 * Vì sao không dùng UIOrientationWidget của game cũ:
 *   - nó phụ thuộc nested class `UIWidgetConfig` (khó gán/serialize),
 *   - và `UIScreenResolution` chỉ phát ORIENTATION_CHANGED ở nhánh portrait nên
 *     xoay sang landscape không có sự kiện nào.
 * Component này tự đo kích thước parent nên không cần event bus.
 *
 * Yêu cầu: node cha phải có UITransform bám theo khung nhìn – tức là Canvas
 * (alignCanvasWithScreen) hoặc một node full-screen stretch bằng cc.Widget.
 */
@ccclass('OrientationLayout')
@executeInEditMode(true)
@menu('UI/OrientationLayout')
export class OrientationLayout extends Component {
    @property({ type: Enum(ScreenAnchor), tooltip: 'Neo khi màn dọc' })
    portraitAnchor: ScreenAnchor = ScreenAnchor.CENTER;

    @property({ type: Vec2, tooltip: 'Lệch so với neo (px design). Neo phải/trên thì dùng số âm để đi vào trong.' })
    portraitOffset: Vec2 = new Vec2(0, 0);

    @property({ tooltip: 'Hệ số nhân lên scale gốc của node khi màn dọc' })
    portraitScale: number = 1;

    @property({ type: Enum(ScreenAnchor), tooltip: 'Neo khi màn ngang' })
    landscapeAnchor: ScreenAnchor = ScreenAnchor.CENTER;

    @property(Vec2)
    landscapeOffset: Vec2 = new Vec2(0, 0);

    @property({ tooltip: 'Hệ số nhân lên scale gốc của node khi màn ngang' })
    landscapeScale: number = 1;

    /** Scale gốc trong scene, dùng làm chuẩn để nhân hệ số. */
    private _baseScale: Vec3 = new Vec3(1, 1, 1);
    private _boundParent: Node | null = null;

    protected onLoad(): void {
        this._baseScale = this.node.scale.clone();
    }

    protected onEnable(): void {
        this.bindParent();
        this.apply();
    }

    protected start(): void {
        // Widget của parent chỉ align xong sau lượt update đầu → áp lại lần nữa.
        this.apply();
    }

    protected onDisable(): void {
        this.unbindParent();
    }

    /** Tính lại vị trí + scale theo khung hiện tại. Gọi tay được sau khi đổi layout. */
    apply = (): void => {
        const parent = this.node.parent;
        const parentUI = parent?.getComponent(UITransform);
        if (!parentUI) return;

        const width = parentUI.contentSize.width;
        const height = parentUI.contentSize.height;
        if (width <= 0 || height <= 0) return;

        const landscape = this.isLandscape(width, height);
        const anchor = landscape ? this.landscapeAnchor : this.portraitAnchor;
        const offset = landscape ? this.landscapeOffset : this.portraitOffset;
        const factor = landscape ? this.landscapeScale : this.portraitScale;

        const base = this.anchorLocalPos(anchor, parentUI);
        this.node.setPosition(
            base.x + offset.x,
            base.y + offset.y,
            this.node.position.z,
        );
        this.node.setScale(
            this._baseScale.x * factor,
            this._baseScale.y * factor,
            this._baseScale.z,
        );
    };

    // ── Internal ─────────────────────────────────────────────────

    private bindParent(): void {
        this.unbindParent();
        const parent = this.node.parent;
        if (!parent) return;
        this._boundParent = parent;
        parent.on(Node.EventType.SIZE_CHANGED, this.apply, this);
    }

    private unbindParent(): void {
        if (!this._boundParent) return;
        this._boundParent.off(Node.EventType.SIZE_CHANGED, this.apply, this);
        this._boundParent = null;
    }

    private isLandscape(width: number, height: number): boolean {
        const design = view.getDesignResolutionSize();
        if (design.height <= 0 || height <= 0) return false;
        return (width / height) > (design.width / design.height);
    }

    /** Toạ độ local của điểm neo, tính theo anchorPoint thật của parent. */
    private anchorLocalPos(anchor: ScreenAnchor, parentUI: UITransform): Vec2 {
        const width = parentUI.contentSize.width;
        const height = parentUI.contentSize.height;
        const left = -parentUI.anchorX * width;
        const bottom = -parentUI.anchorY * height;

        const col = anchor % 3;          // 0 = trái, 1 = giữa, 2 = phải
        const row = Math.floor(anchor / 3); // 0 = trên, 1 = giữa, 2 = dưới

        const x = left + (col === 0 ? 0 : col === 1 ? width / 2 : width);
        const y = bottom + (row === 0 ? height : row === 1 ? height / 2 : 0);
        return new Vec2(x, y);
    }
}
