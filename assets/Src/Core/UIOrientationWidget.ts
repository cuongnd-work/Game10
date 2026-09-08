import { _decorator, Component, Node, Vec3, Widget, find } from 'cc';
import { ORIENTATION_CHANGED, UIScreenResolution } from './UIScreenResolution';

const { ccclass, executeInEditMode, menu, property, requireComponent } = _decorator;

@ccclass('UIWidgetConfig')
export class UIWidgetConfig {
    @property isAlignLeft = false;
    @property isAlignRight = false;
    @property isAlignTop = false;
    @property isAlignBottom = false;
    @property isAlignHorizontalCenter = false;
    @property isAlignVerticalCenter = false;

    @property left = 0;
    @property right = 0;
    @property top = 0;
    @property bottom = 0;
    @property horizontalCenter = 0;
    @property verticalCenter = 0;

    @property({ tooltip: 'Bật để áp scale ở dưới lên node khi orientation này được chọn' })
    overrideScale = false;

    @property({ tooltip: 'Scale áp lên node (x, y, z). Chỉ dùng khi overrideScale = true' })
    scale: Vec3 = new Vec3(1, 1, 1);

    apply(widget: Widget, node: Node): void {
        widget.isAlignLeft = this.isAlignLeft;
        widget.isAlignRight = this.isAlignRight;
        widget.isAlignTop = this.isAlignTop;
        widget.isAlignBottom = this.isAlignBottom;
        widget.isAlignHorizontalCenter = this.isAlignHorizontalCenter;
        widget.isAlignVerticalCenter = this.isAlignVerticalCenter;
        widget.left = this.left;
        widget.right = this.right;
        widget.top = this.top;
        widget.bottom = this.bottom;
        widget.horizontalCenter = this.horizontalCenter;
        widget.verticalCenter = this.verticalCenter;
        widget.updateAlignment();

        if (this.overrideScale) {
            node.setScale(this.scale);
        }
    }
}

@ccclass('UIOrientationWidget')
@executeInEditMode(true)
@requireComponent(Widget)
@menu('UI/UIOrientationWidget')
export class UIOrientationWidget extends Component {
    @property({ type: UIScreenResolution, tooltip: 'Nguồn phát sự kiện xoay màn hình. Bỏ trống để tự tìm trong scene.' })
    resolution: UIScreenResolution | null = null;

    @property({ type: UIWidgetConfig, tooltip: 'Cấu hình Widget khi màn dọc (nút xếp hàng ngang)' })
    portrait: UIWidgetConfig = new UIWidgetConfig();

    @property({ type: UIWidgetConfig, tooltip: 'Cấu hình Widget khi màn ngang (nút xếp cột dọc)' })
    landscape: UIWidgetConfig = new UIWidgetConfig();

    private widget: Widget = null!;

    onLoad(): void {
        this.widget = this.getComponent(Widget)!;
        if (!this.resolution) {
            const canvas = find('Canvas');
            this.resolution = canvas ? canvas.getComponentInChildren(UIScreenResolution) : null;
        }
    }

    onEnable(): void {
        if (!this.resolution) return;
        this.resolution.events.on(ORIENTATION_CHANGED, this.onOrientationChanged, this);
        this.onOrientationChanged(this.resolution.isLandscape);
    }

    onDisable(): void {
        if (!this.resolution) return;
        this.resolution.events.off(ORIENTATION_CHANGED, this.onOrientationChanged, this);
    }

    private onOrientationChanged(landscape: boolean): void {
        if (!this.widget) return;
        (landscape ? this.landscape : this.portrait).apply(this.widget, this.node);
    }
}
