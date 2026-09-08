import { _decorator, AudioClip, AudioSource, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 * AudioContainer – giữ tất cả AudioSource của game.
 */
@ccclass('AudioContainer')
export class AudioContainer extends Component {

    @property(Node)
    soundWarning: Node = null!;        // play khi tap button không hợp lệ

    @property(Node)
    soundUnlock: Node = null!;         // play khi unlock slot/attendant

    @property(Node)
    soundCollectCoin: Node = null!;    // play khi car đổ xăng xong

    @property(Node)
    soundRefueling: Node = null!;      // play khi attendant đang đổ xăng

    @property(Node)
    soundCarHorn: Node = null!;        // play khi bubble icon xuất hiện + khi popup upgrade hiện

    @property(Node)
    soundMaleSad: Node = null!;        // intro cutscene

    @property(Node)
    soundClick: Node = null!;          // play khi tap button attendant popup

    /** Fallback cho scene Slide: không cần dựng thêm node AudioSource bằng tay. */
    @property(AudioClip)
    collectCoinClip: AudioClip = null!;

    @property(AudioClip)
    upgradeClip: AudioClip = null!;

    private _collectCoinSource: AudioSource | null = null;
    private _upgradeSource: AudioSource | null = null;
    private _lastCollectCoinAt: number = -Infinity;

    /** Gộp nhóm khách tới cổng gần như cùng lúc, tránh chồng âm và clipping. */
    private static readonly COLLECT_COIN_COOLDOWN_MS = 80;

    // ─────────────────── Public API ──────────────────────────

    playWarning():      void { this._play(this.soundWarning); }
    playUnlock():       void { this._playClipOrNode(this.soundUnlock, this.upgradeClip, 'upgrade'); }
    playCollectCoin():  void {
        const now = Date.now();
        if (now - this._lastCollectCoinAt < AudioContainer.COLLECT_COIN_COOLDOWN_MS) return;
        this._lastCollectCoinAt = now;
        this._playClipOrNode(this.soundCollectCoin, this.collectCoinClip, 'coin', true);
    }
    playRefueling():    void { this._play(this.soundRefueling); }
    playCarHorn():      void { this._play(this.soundCarHorn); }
    playMaleSad():      void { this._play(this.soundMaleSad); }
    playClick():        void { this._play(this.soundClick); }

    // ─────────────────── Helper ───────────────────────────────

    private _play(node: Node): void {
        if (!node) return;
        const audio = node.getComponent(AudioSource);
        if (audio) audio.play();
    }

    private _playClipOrNode(
        node: Node,
        clip: AudioClip,
        kind: 'coin' | 'upgrade',
        allowOverlap: boolean = false,
    ): void {
        const nodeSource = node?.getComponent(AudioSource) ?? null;
        if (nodeSource) {
            if (allowOverlap && nodeSource.clip) nodeSource.playOneShot(nodeSource.clip);
            else nodeSource.play();
            return;
        }
        if (!clip) return;

        let source = kind === 'coin' ? this._collectCoinSource : this._upgradeSource;
        if (!source) {
            source = this.node.addComponent(AudioSource);
            source.playOnAwake = false;
            source.loop = false;
            if (kind === 'coin') this._collectCoinSource = source;
            else this._upgradeSource = source;
        }
        source.clip = clip;
        if (allowOverlap) source.playOneShot(clip);
        else source.play();
    }
}
