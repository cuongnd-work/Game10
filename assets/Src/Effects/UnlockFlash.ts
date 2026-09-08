import { _decorator, Color, Component, Material, Node, Sprite, sp, tween, Tween, Vec4 } from 'cc';

const { ccclass, property } = _decorator;

interface SpriteState {
    sprite: Sprite;
    originalMaterial: Material | null;
    activeTween: Tween<{ amount: number }> | null;
}

interface SkeletonState {
    skeleton: sp.Skeleton;
    originalMaterial: Material | null;
    originalColor: Color;
    activeTween: Tween<{ amount: number }> | Tween<{ t: number }> | null;
}

/**
 * UnlockFlash – lóe trắng rồi fade về màu gốc cho toàn bộ Sprite / sp.Skeleton
 * nằm dưới node được gắn component. Không dính gì tới gameplay –
 * gọi `play()` bất cứ đâu, hoặc bật `playOnEnable` để tự chạy khi node active.
 */
@ccclass('UnlockFlash')
export class UnlockFlash extends Component {
    /** Material tạo từ effect `flash-white` – dùng cho Sprite. */
    @property(Material)
    flashMaterial: Material = null!;

    /** Material tạo từ effect `flash-white-spine` – dùng cho sp.Skeleton. Nếu null → fallback tint color. */
    @property(Material)
    spineFlashMaterial: Material = null!;

    @property
    duration: number = 0.5;

    /** Giữ ở đỉnh (fully white) bao lâu trước khi fade. */
    @property
    holdAtPeak: number = 0.05;

    /** Bao gồm cả Sprite/Skeleton trong node con hay chỉ xử lý node này. */
    @property
    includeChildren: boolean = true;

    /** Tự play mỗi lần node được enable. Tiện để test hoặc dùng nhiều lần. */
    @property
    playOnEnable: boolean = false;

    protected onEnable(): void {
        if (this.playOnEnable) this.play();
    }

    /** Flash lên toàn bộ Sprite + sp.Skeleton trong node này (và con nếu bật). */
    play(): void {
        this.playOnSprites(this.node);
        this.playOnSkeletons(this.node);
    }

    // ── Sprite path ──────────────────────────────────────────────

    private playOnSprites(root: Node): void {
        if (!this.flashMaterial) return;
        const sprites = this.includeChildren
            ? root.getComponentsInChildren(Sprite)
            : root.getComponents(Sprite);
        for (const sprite of sprites) {
            this.flashSprite(sprite);
        }
    }

    private flashSprite(sprite: Sprite): void {
        const state: SpriteState = {
            sprite,
            originalMaterial: sprite.customMaterial ?? null,
            activeTween: null,
        };

        sprite.customMaterial = this.flashMaterial;
        const mat = sprite.getMaterialInstance(0);
        if (!mat) {
            sprite.customMaterial = state.originalMaterial;
            return;
        }

        const applyAmount = (amount: number) => {
            mat.setProperty('flashAmount', amount);
            mat.setProperty('flashParams', new Vec4(amount, 0, 0, 0));
        };

        const box = { amount: 1.0 };
        applyAmount(box.amount);

        state.activeTween = tween(box)
            .delay(Math.max(0, this.holdAtPeak))
            .to(this.duration, { amount: 0.0 }, {
                onUpdate: () => applyAmount(box.amount),
            })
            .call(() => {
                applyAmount(0);
                sprite.customMaterial = state.originalMaterial;
            })
            .start();
    }

    // ── Spine path ───────────────────────────────────────────────

    private playOnSkeletons(root: Node): void {
        const skeletons = this.includeChildren
            ? root.getComponentsInChildren(sp.Skeleton)
            : root.getComponents(sp.Skeleton);
        // console.log('[UnlockFlash] found skeletons=', skeletons.length, 'on node=', root.name);
        for (const skel of skeletons) {
            this.flashSkeleton(skel);
        }
    }

    private flashSkeleton(skel: sp.Skeleton): void {
        // Ưu tiên shader riêng cho spine – tint white qua skeleton.color không
        // đổi gì (multiplier white = identity), phải qua shader mới lóe được.
        if (this.spineFlashMaterial) {
            this.flashSkeletonWithShader(skel);
            return;
        }
        this.flashSkeletonWithTint(skel);
    }

    private flashSkeletonWithShader(skel: sp.Skeleton): void {
        const skelAny = skel as unknown as { customMaterial?: Material };
        const state: SkeletonState = {
            skeleton: skel,
            originalMaterial: skelAny.customMaterial ?? null,
            originalColor: skel.color.clone(),
            activeTween: null,
        };

        // console.log('[UnlockFlash] flashSkeletonWithShader node=', skel.node.name,
        //     'materialSet=', !!this.spineFlashMaterial);

        skelAny.customMaterial = this.spineFlashMaterial;
        const mat = skel.getMaterialInstance(0);
        // console.log('[UnlockFlash] gotMaterialInstance=', !!mat);
        if (!mat) {
            skelAny.customMaterial = state.originalMaterial;
            this.flashSkeletonWithTint(skel);
            return;
        }

        // Shader flash-spine (3.7 style): u_rate = 0 → hoàn toàn u_color (trắng);
        // u_rate = 1 → màu gốc. Tween 0 → 1 để fade từ trắng về gốc.
        const applyRate = (rate: number) => {
            mat.setProperty('u_rate', rate);
        };

        const box = { rate: 0.0 };
        applyRate(box.rate);

        state.activeTween = tween(box)
            .delay(Math.max(0, this.holdAtPeak))
            .to(this.duration, { rate: 1.0 }, {
                onUpdate: () => applyRate(box.rate),
            })
            .call(() => {
                applyRate(1);
                skelAny.customMaterial = state.originalMaterial;
            })
            .start();
    }

    private flashSkeletonWithTint(skel: sp.Skeleton): void {
        // Fallback khi chưa gán spineFlashMaterial – biết là hiệu ứng gần như
        // không thấy gì, nhưng ít nhất không crash.
        const original = skel.color.clone();
        skel.color = new Color(255, 255, 255, original.a);
        const box = { t: 0 };
        tween(box)
            .delay(Math.max(0, this.holdAtPeak))
            .to(this.duration, { t: 1 }, {
                onUpdate: () => {
                    const t = box.t;
                    const r = Math.round(255 * (1 - t) + original.r * t);
                    const g = Math.round(255 * (1 - t) + original.g * t);
                    const b = Math.round(255 * (1 - t) + original.b * t);
                    skel.color = new Color(r, g, b, original.a);
                },
            })
            .call(() => {
                skel.color = original.clone();
            })
            .start();
    }
}
