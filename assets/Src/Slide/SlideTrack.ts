import { _decorator, CCFloat, Component, Node, Sprite, SpriteFrame, Vec3, sp } from 'cc';
import { Customer } from 'db://assets/Src/Slide/Customer';
import { SLIDE_CONFIG } from 'db://assets/Src/Slide/SlideConfig';

const { ccclass, property } = _decorator;

/**
 * SlideTrack – 1 làn trượt. Chỉ mô tả hình học + visual của làn, không biết gì
 * về kinh tế hay hàng chờ (SlideField điều phối).
 *
 * Wiring trong scene:
 *   platformPoint  – chỗ khách đứng chờ trên đỉnh
 *   slidePath[]    – các waypoint từ platform xuống chân cầu trượt
 *   archNode       – cổng vòm ở cuối; chạm tới đây = ăn tiền
 *   exitPath[]     – waypoint rời sân sau khi qua cổng
 *   riderSlot      – node rỗng NẰM GIỮA sprite thân ống (slideN_1) và sprite
 *                    thành trước (slideN_2). SlideField đẩy khách vào đây lúc
 *                    bắt đầu trượt để khách chui BÊN TRONG ống, không đè lên nó.
 *
 * Làn KHÔNG bị nhân bản theo level: cả 3 level dùng chung một node làn, Lv Up
 * chỉ đổi spriteFrame của body/rail, bật mái kính và xoay mái kính (xem
 * `applyLevel`). Body/rail không bị xoay.
 */
@ccclass('SlideTrack')
export class SlideTrack extends Component {
    @property({ tooltip: 'Thứ tự bật làn. 0 = làn có sẵn lúc bắt đầu game.' })
    laneIndex: number = 0;

    @property(Node)
    platformPoint: Node = null!;

    @property([Node])
    slidePath: Node[] = [];

    @property(Node)
    archNode: Node = null!;

    @property([Node])
    exitPath: Node[] = [];

    @property({ type: Node, tooltip: 'Parent của khách khi đang trượt – đặt giữa lớp thân ống và lớp thành trước' })
    riderSlot: Node = null!;

    @property({ type: Sprite, tooltip: 'Sprite thân ống (slideN_1) – đổi art theo level' })
    bodySprite: Sprite = null!;

    @property({ type: Sprite, tooltip: 'Sprite thành trước (slideN_2) – đổi art theo level' })
    railSprite: Sprite = null!;

    @property({
        type: [SpriteFrame],
        tooltip: 'Art thân ống theo level, index 0 = Lv1. Level vượt quá số phần tử thì dùng phần tử cuối.',
    })
    bodyFramesByLevel: SpriteFrame[] = [];

    @property({
        type: [SpriteFrame],
        tooltip: 'Art thành trước theo level, cùng quy tắc với bodyFramesByLevel',
    })
    railFramesByLevel: SpriteFrame[] = [];

    @property({ type: Node, tooltip: 'Mái kính – chỉ bật từ SLIDE_CONFIG.DOME_FROM_LEVEL trở lên' })
    dome: Node = null!;

    @property({
        type: [CCFloat],
        tooltip: 'Góc nghiêng Z (độ) của MÁI KÍNH theo level, index 0 = Lv1. '
            + 'Chỉ mái kính xoay – body/rail giữ nguyên góc trong scene. '
            + 'Level vượt quá số phần tử thì dùng phần tử cuối.',
    })
    domeTiltZByLevel: number[] = [];

    @property({ type: [Node], tooltip: 'Spine VFX bật khi làn mới xuất hiện; tự ẩn khi anim xong' })
    appearEffects: Node[] = [];

    @property({ tooltip: 'Tên anim của appearEffects. Bỏ trống = dùng defaultAnimation của spine.' })
    appearAnimName: string = '';

    @property({ type: [Node], tooltip: 'Spine VFX toé nước bật khi khách chạm cổng vòm' })
    splashEffects: Node[] = [];

    @property({ tooltip: 'Tên anim của splashEffects. Bỏ trống = dùng defaultAnimation của spine.' })
    splashAnimName: string = '';

    /** Thời gian tắt VFX khi không lấy được duration thật từ spine. */
    private static readonly FX_FALLBACK_DURATION = 1;

    private _customer: Customer | null = null;
    private _currentLevel: number = 1;

    /** Level 2/3 dùng thân máng cong chữ S; offset theo các SP1..SP4. */
    private static readonly CURVED_PATH_X_OFFSETS = [-3, -20, 8, 0];
    private static readonly CURVE_SAMPLES_PER_SEGMENT = 4;

    /** Làn đang bật và chưa có khách nào chiếm. */
    get isFree(): boolean {
        return this.node.active && this._customer === null;
    }

    get currentCustomer(): Customer | null {
        return this._customer;
    }

    protected onLoad(): void {
        this.hideAllEffects();
    }

    assign(customer: Customer): void {
        this._customer = customer;
    }

    free(): void {
        this._customer = null;
    }

    setActive(active: boolean): void {
        if (this.node.active === active) return;
        this.node.active = active;
        if (!active) this._customer = null;
    }

    /**
     * Áp art của `level` (1-based) lên làn: đổi spriteFrame body/rail và bật/tắt
     * mái kính. Hình học (platform, slidePath, arch, exit) không đổi theo level.
     */
    applyLevel(level: number): void {
        this._currentLevel = Math.max(1, level);
        this.applyFrame(this.bodySprite, this.bodyFramesByLevel, level);
        this.applyFrame(this.railSprite, this.railFramesByLevel, level);
        if (this.dome) this.dome.active = level >= SLIDE_CONFIG.DOME_FROM_LEVEL;

        // Chỉ mái kính xoay theo level. Body/Rail giữ đúng góc đã set trong
        // scene: hai sprite này là một CẶP art khớp nhau (cùng canvas 284x876,
        // cùng lpos, cùng scale) nên không được xoay lệch nhau.
        const tilt = this.levelValue(this.domeTiltZByLevel, level);
        if (tilt !== null && this.dome) {
            this.dome.setRotationFromEuler(0, 0, tilt);
        }
    }

    /** Level thiếu art thì dùng phần tử cuối – Lv3 nhờ vậy tự dùng lại art Lv2. */
    private applyFrame(sprite: Sprite, frames: SpriteFrame[], level: number): void {
        if (!sprite || frames.length === 0) return;
        const frame = frames[this.levelIndex(frames.length, level)];
        if (frame) sprite.spriteFrame = frame;
    }

    /** Giá trị ứng với `level` trong mảng theo level; null nếu mảng rỗng. */
    private levelValue(values: number[], level: number): number | null {
        if (values.length === 0) return null;
        return values[this.levelIndex(values.length, level)];
    }

    /** Level 1-based → index, kẹp vào [0, count-1] (level thiếu dùng phần tử cuối). */
    private levelIndex(count: number, level: number): number {
        return Math.min(count - 1, Math.max(0, level - 1));
    }

    getPlatformWorldPos(): Vec3 {
        return (this.platformPoint ?? this.node).worldPosition.clone();
    }

    /** slidePath + archNode. Waypoint cuối luôn là cổng vòm. */
    getSlidePathWorld(): Vec3[] {
        const path = this.slidePath
            .filter((n) => !!n)
            .map((n) => n.worldPosition.clone());
        if (this.archNode) path.push(this.archNode.worldPosition.clone());
        if (this._currentLevel < 2 || path.length < 2) return path;

        // Art level cao uốn chữ S. Dịch control point theo trục X của lane rồi
        // lấy mẫu Catmull-Rom để nhân vật bám thân máng thay vì cắt đường thẳng.
        const scaleX = Math.abs(this.node.worldScale.x);
        for (let i = 0; i < this.slidePath.length && i < path.length; i++) {
            path[i].x += (SlideTrack.CURVED_PATH_X_OFFSETS[i] ?? 0) * scaleX;
        }

        const start = this.getPlatformWorldPos();
        return this.sampleCatmullRom([start, ...path]);
    }

    private sampleCatmullRom(points: Vec3[]): Vec3[] {
        const result: Vec3[] = [];
        const samples = SlideTrack.CURVE_SAMPLES_PER_SEGMENT;
        for (let segment = 0; segment < points.length - 1; segment++) {
            const p0 = points[Math.max(0, segment - 1)];
            const p1 = points[segment];
            const p2 = points[segment + 1];
            const p3 = points[Math.min(points.length - 1, segment + 2)];
            for (let sample = 1; sample <= samples; sample++) {
                result.push(this.catmullRom(p0, p1, p2, p3, sample / samples));
            }
        }
        return result;
    }

    private catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
        const t2 = t * t;
        const t3 = t2 * t;
        return new Vec3(
            0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t
                + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
                + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t
                + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
                + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            p1.z + (p2.z - p1.z) * t,
        );
    }

    getExitPathWorld(): Vec3[] {
        return this.exitPath
            .filter((n) => !!n)
            .map((n) => n.worldPosition.clone());
    }

    /** Bật spine "appear" khi làn được mở. Tự ẩn khi anim chạy xong. */
    playAppearEffect(): void {
        this.playOneShot(this.appearEffects, this.appearAnimName);
    }

    /** Bật spine toé nước ở cổng vòm khi khách kết thúc lượt trượt. */
    playSplashEffect(): void {
        this.playOneShot(this.splashEffects, this.splashAnimName);
    }

    hideAllEffects(): void {
        for (const node of this.appearEffects) {
            if (node) node.active = false;
        }
        for (const node of this.splashEffects) {
            if (node) node.active = false;
        }
    }

    /**
     * Bật node spine, chạy 1 lượt anim rồi tự tắt. Ngoài listener "track complete"
     * còn hẹn giờ tắt dự phòng: setAnimation() có thể trả null nếu skeleton chưa
     * kịp init trong frame vừa bật node, khi đó VFX sẽ đứng hình vĩnh viễn.
     */
    private playOneShot(nodes: Node[], animName: string): void {
        for (const node of nodes) {
            if (!node) continue;
            node.active = true;

            const sk = node.getComponent(sp.Skeleton) ?? node.getComponentInChildren(sp.Skeleton);
            if (!sk) continue;
            // defaultAnimation là protected trong .d.ts của Creator → ép any để
            // không tạo lỗi typecheck mới (game cũ đang dính đúng lỗi này).
            const name = animName || ((sk as any).defaultAnimation as string) || '';
            if (!name) continue;

            const entry = sk.setAnimation(0, name, false);
            if (entry) {
                sk.setTrackCompleteListener(entry, () => { node.active = false; });
            }
            const duration = entry?.animation?.duration ?? SlideTrack.FX_FALLBACK_DURATION;
            this.scheduleOnce(() => { node.active = false; }, duration + 0.05);
        }
    }
}
