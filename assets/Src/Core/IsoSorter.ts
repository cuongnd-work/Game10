import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 * IsoSorter – sort render order theo Y cho isometric 2.5D.
 *
 * QUAN TRỌNG – cấu trúc scene phải tách floor ra riêng:
 *
 *   GameLayer
 *     ├─ FloorLayer      ← sàn nhà, KHÔNG dưới IsoSorter
 *     └─ IsoLayer        ← gắn IsoSorter vào đây
 *          ├─ Wall_A
 *          ├─ Slot_1
 *          ├─ Attendant_1
 *          ├─ Car_1
 *          └─ ...
 *
 * Nguyên tắc sort:
 *   Y thấp hơn (gần camera, thấp trên màn hình) → render ON TOP
 *   Y cao hơn  (xa camera, cao trên màn hình)   → render BEHIND
 */
@ccclass('IsoSorter')
export class IsoSorter extends Component {
    /**
     * Nếu để trống → sort tất cả children của node này.
     * Nếu điền vào → chỉ sort các node trong danh sách.
     */
    @property([Node])
    targets: Node[] = [];

    /**
     * Đảo chiều sort nếu scene của bạn dùng trục Y ngược lại.
     * Thử bật nếu employee vẫn bị render sai chiều.
     */
    @property
    invertSort: boolean = false;

    /**
     * Dùng khi pivot sprite không ở chân nhân vật.
     * = chiều cao sprite / 2 (nếu pivot ở giữa)
     */
    @property
    pivotOffsetY: number = 0;

    private _buf: Node[] = [];

    protected update(): void {
        const nodes = this.targets.length > 0
            ? this.targets
            : this.node.children;

        if (nodes.length < 2) return;

        this._buf.length = 0;
        for (const n of nodes) {
            if (n.active) this._buf.push(n);
        }

        const sign = this.invertSort ? -1 : 1;

        // Y thấp hơn → index cao hơn → render trên cùng
        this._buf.sort((a, b) =>
            sign * ((a.worldPosition.y + this.pivotOffsetY) -
                    (b.worldPosition.y + this.pivotOffsetY))
        );

        for (let i = 0; i < this._buf.length; i++) {
            this._buf[i].setSiblingIndex(i);
        }
    }
}
