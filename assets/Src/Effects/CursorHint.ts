import {
    _decorator,
    Camera,
    Canvas,
    Color,
    Component,
    Graphics,
    Mask,
    Node,
    screen,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('CursorHint')
export class CursorHint extends Component {
    @property(Vec3)
    offset: Vec3 = new Vec3(0, -30, 0);

    /** Offset khi hand-tap trỏ vào button (slot / attendant / fake). */
    @property(Vec3)
    handOffset: Vec3 = new Vec3(0, -30, 0);

    /** Offset khi hand-tap trỏ vào gift box. */
    @property(Vec3)
    giftHandOffset: Vec3 = new Vec3(0, -30, 0);

    /** Scale hand-tap khi trỏ vào button. */
    @property(Vec3)
    handScale: Vec3 = new Vec3(1, 1, 1);

    /** Scale hand-tap khi trỏ vào gift box. */
    @property(Vec3)
    giftHandScale: Vec3 = new Vec3(1, 1, 1);

    @property
    holeWidth: number = 220;

    @property
    holeHeight: number = 120;

    @property
    holePaddingX: number = 24;

    @property
    holePaddingY: number = 24;

    @property(Color)
    overlayColor: Color = new Color(0, 0, 0, 180);

    @property
    overlayEnabled: boolean = true;

    @property(Node)
    overlayNode: Node = null!;

    @property(Node)
    holeNode: Node = null!;

    @property(Node)
    handTut: Node = null!;

    private _bounceTween: Tween<Node> | null = null;
    private _opacity: UIOpacity | null = null;
    private _overlayGraphics: Graphics | null = null;
    private _generatedOverlayNode: Node | null = null;

    protected onLoad(): void {
        this._opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this.ensureGeneratedOverlay();
        this.node.active = false;
        this.setOverlayActive(false);
    }

    pointAt(targetNode: Node, overlayTargetNode?: Node | null, kind: 'gift' | 'button' = 'button'): void {
        this.node.active = true;
        const handNode = this.getHandNode();
        if (handNode) {
            handNode.active = true;
            this.applyHandScale(handNode, kind);
        }
        if (this._opacity) {
            this._opacity.opacity = 255;
        }

        if (overlayTargetNode) {
            this.updateOverlay(overlayTargetNode);
        } else {
            this.setOverlayActive(false);
        }
        this.updatePosition(targetNode, kind);
        this.startBounce();
    }

    hide(): void {
        if (this._bounceTween) {
            this._bounceTween.stop();
            this._bounceTween = null;
        }
        this.setOverlayActive(false);
        const handNode = this.getHandNode();
        if (handNode) {
            handNode.active = false;
        }
        this.node.active = false;
    }

    private updatePosition(targetNode: Node, kind: 'gift' | 'button'): void {
        const handNode = this.getHandNode();
        const handParent = handNode?.parent ?? this.node.parent;
        const localPos = this.convertTargetToUILocal(targetNode, handParent);
        if (!handNode) return;
        const off = this.getHandOffset(kind);
        handNode.setPosition(
            localPos.x + off.x,
            localPos.y + off.y,
            handNode.position.z,
        );
    }

    private updateOverlay(targetNode: Node): void {
        if (!this.overlayEnabled) {
            this.setOverlayActive(false);
            return;
        }

        if (this.overlayNode && this.holeNode) {
            this.updateReferencedOverlay(targetNode);
            return;
        }

        this.updateGeneratedOverlay(targetNode);
    }

    private updateReferencedOverlay(targetNode: Node): void {
        this.prepareReferencedOverlay();

        const overlay = this.overlayNode;
        const hole = this.holeNode;
        const overlayRoot = hole.parent;
        const overlayRootTransform = overlayRoot?.getComponent(UITransform);
        const holeTransform = hole.getComponent(UITransform);
        const overlayTransform = overlay.getComponent(UITransform);
        const targetTransform = targetNode.getComponent(UITransform);
        const holeGraphics = hole.getComponent(Graphics);
        const holeMask = hole.getComponent(Mask);

        if (!overlay || !hole || !overlayRoot || !overlayRootTransform || !holeTransform || !overlayTransform) {
            this.setOverlayActive(false);
            return;
        }

        const holeLocalPos = this.convertTargetToUILocal(targetNode, overlayRoot);
        hole.setPosition(holeLocalPos.x, holeLocalPos.y, hole.position.z);

        let width = this.holeWidth;
        let height = this.holeHeight;
        if (targetTransform) {
            width = Math.max(width, targetTransform.contentSize.width + this.holePaddingX * 2);
            height = Math.max(height, targetTransform.contentSize.height + this.holePaddingY * 2);
        }
        holeTransform.setContentSize(width, height);

        if (holeMask && holeGraphics) {
            holeGraphics.clear();
            holeGraphics.fillColor = Color.WHITE;
            holeGraphics.rect(-width * 0.5, -height * 0.5, width, height);
            holeGraphics.fill();
        }

        const currentHoleLocalPos = hole.position.clone();
        overlay.setPosition(-currentHoleLocalPos.x, -currentHoleLocalPos.y, overlay.position.z);

        overlay.active = true;
        hole.active = true;
        hole.parent.active = true;
    }

    private prepareReferencedOverlay(): void {
        if (!this.overlayNode || !this.holeNode) {
            return;
        }

        const holeMask = this.holeNode.getComponent(Mask);
        const holeTransform = this.holeNode.getComponent(UITransform);
        const overlayTransform = this.overlayNode.getComponent(UITransform);
        if (!holeMask || !holeTransform || !overlayTransform) {
            return;
        }

        if (this.overlayNode.parent !== this.holeNode) {
            this.overlayNode.removeFromParent();
            this.holeNode.addChild(this.overlayNode);
        }

        this.overlayNode.setPosition(0, 0, 0);
        this.overlayNode.setSiblingIndex(0);
    }

    private ensureGeneratedOverlay(): void {
        if (this.overlayNode || this.holeNode) {
            return;
        }
        if (this._generatedOverlayNode && this._overlayGraphics) {
            return;
        }

        const parent = this.node.parent;
        if (!parent) {
            return;
        }

        const existing = parent.getChildByName('HintOverlayMask');
        this._generatedOverlayNode = existing ?? new Node('HintOverlayMask');
        if (!existing) {
            parent.addChild(this._generatedOverlayNode);
        }

        this._generatedOverlayNode.layer = this.node.layer;
        this._generatedOverlayNode.setSiblingIndex(this.node.getSiblingIndex());

        const transform = this._generatedOverlayNode.getComponent(UITransform)
            || this._generatedOverlayNode.addComponent(UITransform);
        const overlaySizeSource = this.getOverlaySizeSource();
        transform.setContentSize(overlaySizeSource.width, overlaySizeSource.height);
        this._generatedOverlayNode.setPosition(0, 0, 0);

        this._overlayGraphics = this._generatedOverlayNode.getComponent(Graphics)
            || this._generatedOverlayNode.addComponent(Graphics);
    }

    private updateGeneratedOverlay(targetNode: Node): void {
        this.ensureGeneratedOverlay();
        if (!this._generatedOverlayNode || !this._overlayGraphics) {
            this.setOverlayActive(false);
            return;
        }

        this._generatedOverlayNode.setSiblingIndex(this.node.getSiblingIndex());

        const overlayTransform = this._generatedOverlayNode.getComponent(UITransform);
        const overlayParent = this._generatedOverlayNode.parent;
        const overlayParentTransform = overlayParent?.getComponent(UITransform);
        const targetTransform = targetNode.getComponent(UITransform);
        if (!overlayTransform || !overlayParent || !overlayParentTransform) {
            this.setOverlayActive(false);
            return;
        }

        const overlaySizeSource = this.getOverlaySizeSource();
        overlayTransform.setContentSize(overlaySizeSource.width, overlaySizeSource.height);

        const overlayWidth = overlayTransform.contentSize.width;
        const overlayHeight = overlayTransform.contentSize.height;
        const targetLocal = overlayParentTransform.convertToNodeSpaceAR(targetNode.worldPosition.clone());

        let width = this.holeWidth;
        let height = this.holeHeight;
        if (targetTransform) {
            width = Math.max(width, targetTransform.contentSize.width + this.holePaddingX * 2);
            height = Math.max(height, targetTransform.contentSize.height + this.holePaddingY * 2);
        }

        const halfOverlayW = overlayWidth * 0.5;
        const halfOverlayH = overlayHeight * 0.5;
        const holeLeft = Math.max(-halfOverlayW, targetLocal.x - width * 0.5);
        const holeRight = Math.min(halfOverlayW, targetLocal.x + width * 0.5);
        const holeBottom = Math.max(-halfOverlayH, targetLocal.y - height * 0.5);
        const holeTop = Math.min(halfOverlayH, targetLocal.y + height * 0.5);

        const g = this._overlayGraphics;
        g.clear();
        g.fillColor = this.overlayColor;
        this.drawRect(g, -halfOverlayW, holeTop, overlayWidth, halfOverlayH - holeTop);
        this.drawRect(g, -halfOverlayW, -halfOverlayH, overlayWidth, holeBottom + halfOverlayH);
        this.drawRect(g, -halfOverlayW, holeBottom, holeLeft + halfOverlayW, holeTop - holeBottom);
        this.drawRect(g, holeRight, holeBottom, halfOverlayW - holeRight, holeTop - holeBottom);

        this._generatedOverlayNode.active = true;
    }

    private setOverlayActive(active: boolean): void {
        if (this.overlayNode) {
            this.overlayNode.active = active;
        }
        if (this.holeNode) {
            this.holeNode.active = active;
            if (this.holeNode.parent) {
                this.holeNode.parent.active = active;
            }
        }
        if (this._generatedOverlayNode) {
            this._generatedOverlayNode.active = active;
        }
    }

    private getOverlaySizeSource(): { width: number; height: number } {
        let current: Node | null = this.node;
        let width = 0;
        let height = 0;
        let maxArea = -1;

        while (current) {
            const transform = current.getComponent(UITransform);
            if (transform) {
                const area = transform.contentSize.width * transform.contentSize.height;
                if (area >= maxArea) {
                    maxArea = area;
                    width = transform.contentSize.width;
                    height = transform.contentSize.height;
                }
            }
            current = current.parent;
        }

        return {
            width: width > 0 ? width : 720,
            height: height > 0 ? height : 1280,
        };
    }

    private convertTargetToUILocal(targetNode: Node, uiParent: Node | null): Vec3 {
        const fallbackWorld = targetNode.worldPosition.clone();
        if (!uiParent) {
            return fallbackWorld;
        }

        const canvas = this.node.scene?.getComponentInChildren(Canvas);
        const canvasCamera = canvas?.cameraComponent ?? null;
        const parentTransform = uiParent.getComponent(UITransform);
        if (!canvasCamera || !parentTransform) {
            return parentTransform
                ? parentTransform.convertToNodeSpaceAR(fallbackWorld)
                : fallbackWorld;
        }

        const cameraAny = canvasCamera as Camera & {
            convertToUINode?: (worldPos: Vec3, uiNode: Node, out?: Vec3) => Vec3;
            worldToScreen?: (out: Vec3, worldPos: Vec3) => Vec3;
        };

        if (typeof cameraAny.convertToUINode === 'function') {
            return cameraAny.convertToUINode(fallbackWorld, uiParent, new Vec3());
        }

        if (typeof cameraAny.worldToScreen === 'function') {
            const screenPos = cameraAny.worldToScreen(new Vec3(), fallbackWorld);
            const windowSize = screen.windowSize;
            const parentSize = parentTransform.contentSize;
            return new Vec3(
                (screenPos.x / windowSize.width - 0.5) * parentSize.width,
                (screenPos.y / windowSize.height - 0.5) * parentSize.height,
                0,
            );
        }

        return parentTransform.convertToNodeSpaceAR(fallbackWorld);
    }

    private drawRect(graphics: Graphics, x: number, y: number, width: number, height: number): void {
        if (width <= 0 || height <= 0) {
            return;
        }
        graphics.rect(x, y, width, height);
        graphics.fill();
    }

    private startBounce(): void {
        if (this._bounceTween) {
            this._bounceTween.stop();
        }

        const handNode = this.getHandNode();
        if (!handNode) {
            return;
        }

        const originPos = handNode.position.clone();
        const downPos = new Vec3(originPos.x, originPos.y - 12, originPos.z);

        this._bounceTween = tween(handNode)
            .to(0.4, { position: downPos }, { easing: 'sineInOut' })
            .to(0.4, { position: originPos }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    private getHandNode(): Node | null {
        return this.handTut ?? this.node;
    }

    private getHandOffset(kind: 'gift' | 'button'): Vec3 {
        if (!this.handTut) return this.offset;
        return kind === 'gift' ? this.giftHandOffset : this.handOffset;
    }

    private applyHandScale(handNode: Node, kind: 'gift' | 'button'): void {
        // Chỉ set scale nếu có handTut riêng – tránh đè scale của node gốc.
        if (!this.handTut) return;
        const s = kind === 'gift' ? this.giftHandScale : this.handScale;
        handNode.setScale(s.x, s.y, s.z);
    }
}
