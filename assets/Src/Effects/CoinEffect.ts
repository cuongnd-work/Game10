import { _decorator, Component, Node, Label, Vec3, tween, UIOpacity, instantiate, Prefab } from 'cc';
const { ccclass, property } = _decorator;

/**
 * CoinEffect – tạo hiệu ứng "+20" nảy lên tại vị trí spawn rồi fade dần.
 * Gắn vào một node quản lý effect (VD: node UILayer hoặc EffectLayer).
 */
@ccclass('CoinEffect')
export class CoinEffect extends Component {
    /** Prefab của label "+XX" (cần có Label + UIOpacity component) */
    @property(Prefab)
    coinLabelPrefab: Prefab = null!;

    /** Prefab của label "xN" bonus multiplier (optional – fallback về coinLabelPrefab) */
    @property(Prefab)
    multiplierLabelPrefab: Prefab = null!;

    /** Offset spawn của multiplier prefab so với worldPos truyền vào */
    @property(Vec3)
    multiplierOffset: Vec3 = new Vec3(0, 0, 0);

    /** Node đích mà đồng xu bay đến (node MoneyDisplay trên UI) */
    @property(Node)
    moneyTargetNode: Node = null!;

    /**
     * Phát hiệu ứng đồng xu từ worldPos bay lên.
     * @param worldPos  Vị trí phát sinh (world space)
     * @param amount    Số tiền (hiển thị "+{amount}")
     * @param onArrived Callback khi coin đến đích (để cộng tiền vào UI)
     */
    /** Hiện sprite "xN" trong prefab Multiplier, tween up + fade dần */
    spawnMultiplierEffect(worldPos: Vec3, multiplier: number): void {
        if (multiplier <= 1) return;
        const prefab = this.multiplierLabelPrefab;
        if (!prefab) return;

        const node = instantiate(prefab);
        node.parent = this.node;
        const spawnPos = new Vec3(
            worldPos.x + this.multiplierOffset.x,
            worldPos.y + this.multiplierOffset.y,
            worldPos.z + this.multiplierOffset.z,
        );
        node.worldPosition = spawnPos;

        const stateName = `x${multiplier}`;
        let foundState = false;
        for (const child of node.children) {
            const match = child.name === stateName;
            child.active = match;
            if (match) foundState = true;
        }
        if (!foundState) {
            node.destroy();
            return;
        }

        const opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        opacity.opacity = 255;

        const upPos = spawnPos.clone();
        upPos.y += 120;

        tween(node)
            .to(0.7, { worldPosition: upPos }, { easing: 'sineOut' })
            .start();

        tween(opacity)
            .delay(0.35)
            .to(0.4, { opacity: 0 })
            .call(() => { node.destroy(); })
            .start();
    }

    spawn(worldPos: Vec3, amount: number, onArrived?: () => void): void {
        if (!this.coinLabelPrefab) {
            onArrived?.();
            return;
        }

        const labelNode = instantiate(this.coinLabelPrefab);
        labelNode.parent = this.node;
        // EffceCoin prefab lưu layer của camera world cũ. Slide scene chạy UI
        // bằng layer của CoinEffect, nên phải đồng bộ cả cây sau khi instantiate.
        this.setLayerRecursively(labelNode, this.node.layer);
        labelNode.worldPosition = worldPos.clone();

        // Label nằm ở child cuối trong prefab EffceCoin – tìm bằng getComponentInChildren
        // để không lệ thuộc vào vị trí cụ thể nếu prefab restructure.
        const label = labelNode.getComponentInChildren(Label);
        if (label) {
            label.string = `+${amount}`;
        }

        const opacity = labelNode.getComponent(UIOpacity) || labelNode.addComponent(UIOpacity);
        opacity.opacity = 255;

        const prefabScale = labelNode.scale.clone();
        // Tăng 20% từ mức 80% đã tuning trước đó: 0.8 * 1.2 = 0.96.
        const displayScale = new Vec3(
            prefabScale.x * 0.96,
            prefabScale.y * 0.96,
            prefabScale.z,
        );
        labelNode.setScale(displayScale.x * 0.72, displayScale.y * 0.72, displayScale.z);

        // Nảy lên tại chỗ spawn và fade song song – không dừng rồi mới fade.
        const bounceTarget = worldPos.clone();
        bounceTarget.y += 180;
        const duration = 0.7;

        tween(labelNode)
            .to(duration, { worldPosition: bounceTarget }, { easing: 'sineOut' })
            .call(() => { labelNode.destroy(); })
            .start();

        tween(labelNode)
            .to(0.16, {
                scale: new Vec3(
                    displayScale.x * 1.18,
                    displayScale.y * 1.18,
                    displayScale.z,
                ),
            }, { easing: 'backOut' })
            .to(0.18, { scale: displayScale }, { easing: 'quadOut' })
            .start();

        tween(opacity)
            .to(duration, { opacity: 0 }, { easing: 'quadIn' })
            .start();

        onArrived?.();
    }

    private setLayerRecursively(node: Node, layer: number): void {
        node.layer = layer;
        for (const child of node.children) this.setLayerRecursively(child, layer);
    }
}
