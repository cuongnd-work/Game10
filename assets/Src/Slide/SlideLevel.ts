import { _decorator, Component } from 'cc';
import { SlideTrack } from 'db://assets/Src/Slide/SlideTrack';

const { ccclass, property } = _decorator;

/**
 * SlideLevel – bộ làn trượt của sân. CHỈ CÓ MỘT node duy nhất trong scene
 * (node Slides): Lv Up không đổi node nữa mà re-skin từng làn qua
 * `SlideTrack.applyLevel()`.
 *
 * Phải chứa đủ (BASE_LANE_COUNT + LANE_MAX_UPGRADES) làn; số làn hiển thị do
 * laneCount quyết định, không phải do level.
 */
@ccclass('SlideLevel')
export class SlideLevel extends Component {
    @property({ type: [SlideTrack], tooltip: 'Các làn của level này, bật dần theo laneIndex' })
    tracks: SlideTrack[] = [];

    setActive(active: boolean): void {
        if (this.node.active === active) return;
        this.node.active = active;
    }

    /** Áp art của `level` (1-based) lên MỌI làn, kể cả làn đang tắt. */
    applyLevel(level: number): void {
        for (const track of this.tracks) {
            track?.applyLevel(level);
        }
    }

    /** Nhả toàn bộ khách đang gán vào các làn của level này. */
    freeAllTracks(): void {
        for (const track of this.tracks) {
            track?.free();
        }
    }

    /**
     * Thứ tự mở làn theo tên node: Lane_9 -> Lane_0.
     * laneIndex mô tả bố cục cũ (giữa-ra-ngoài), nên không dùng nó để quyết
     * định thứ tự unlock nữa. Track không đúng format Lane_N sẽ nằm cuối và
     * vẫn dùng laneIndex làm fallback ổn định.
     */
    orderedTracks(): SlideTrack[] {
        return this.tracks
            .filter((track) => !!track)
            .sort((a, b) => {
                const aNumber = this.laneNumber(a);
                const bNumber = this.laneNumber(b);
                if (aNumber !== bNumber) return bNumber - aNumber;
                return a.laneIndex - b.laneIndex;
            });
    }

    /** Các làn đang bật theo đúng thứ tự unlock Lane_9 -> Lane_0. */
    activeTracks(): SlideTrack[] {
        return this.orderedTracks().filter((track) => track.node.active);
    }

    private laneNumber(track: SlideTrack): number {
        const match = /^Lane_(\d+)$/i.exec(track.node.name);
        return match ? Number(match[1]) : Number.NEGATIVE_INFINITY;
    }
}
