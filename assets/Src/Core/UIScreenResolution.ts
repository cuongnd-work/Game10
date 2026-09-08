import { _decorator, Component, Widget, EventTarget, view, UITransform, screen, Node, Camera, Vec3 } from 'cc';

import { UIManager } from "./UIManager";
const { ccclass, executeInEditMode,property, menu, requireComponent } = _decorator;

export const ORIENTATION_CHANGED = 'orientation-changed';
@ccclass('UIScreenResolution')
@executeInEditMode(true)
@requireComponent(Widget)
@menu('UI/UIScreenResolution')
export class UIScreenResolution extends Component {
    readonly events = new EventTarget();
    private widget: Widget = null!;
    private uiTransform: UITransform = null!;
    private designAspectRatio = 0;
    private lastLandscape: boolean | null = null;
    @property(Camera) cameraController: Camera = null;
    @property(UIManager) uiManager: UIManager = null;

    onLoad() {
        this.assignField();
        this.assignWidget();
        this.getAspectRatio();
    }
    get isLandscape(): boolean {
        const frame = screen.windowSize;
        const design = view.getDesignResolutionSize();
        return (frame.width / frame.height) > (design.width / design.height);
    }
    private getAspectRatio() {
        const designSize = view.getDesignResolutionSize();
        this.designAspectRatio = designSize.width / designSize.height;
        this.resizeToFullScreen();
    }

    private assignWidget() {
        Object.assign(this.widget, {
            isAlignLeft: true,
            isAlignRight: true,
            isAlignTop: true,
            isAlignBottom: true,
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        });
    }

    private assignField() {
        this.widget = this.getComponent(Widget)!;
        this.uiTransform = this.getComponent(UITransform)!;
    }

    onEnable() {
        this.node.on(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    onDisable() {
        this.node.off(Node.EventType.SIZE_CHANGED, this.resizeToFullScreen, this);
    }

    public resizeToFullScreen() {

        if (!this.widget || !this.uiTransform) return;
        const frameSize = screen.windowSize;
        const frameAspectRatio = frameSize.width / frameSize.height;
        const heightCamDefaut = 540;
        const heiCamSet = 1000;
        let ratioCam = heightCamDefaut / heiCamSet;
        // console.log(frameSize)

        this.widget.left = this.widget.right = this.widget.top = this.widget.bottom = null;

        if (frameAspectRatio > this.designAspectRatio) {
            this.uiTransform.height = view.getDesignResolutionSize().height;
            this.uiTransform.width = this.uiTransform.height * frameAspectRatio;
            // if (this.cameraController) this.cameraController.orthoHeight = 450;
            this.uiManager?.warningTextNode?.setScale(new Vec3(1.5,1.5,1.5));
        } else {
            this.uiTransform.width = view.getDesignResolutionSize().width;
            this.uiTransform.height = this.uiTransform.width / frameAspectRatio;
            // if (this.cameraController) this.cameraController.orthoHeight = 825;
            this.uiManager?.warningTextNode?.setScale(new Vec3(1,1,1));

            const cur = frameAspectRatio > this.designAspectRatio;
            if (cur !== this.lastLandscape) {
                this.lastLandscape = cur;
                this.events.emit(ORIENTATION_CHANGED, cur);
            }
        }

        this.widget.left = this.widget.right = this.widget.top = this.widget.bottom = 0;
    }
}