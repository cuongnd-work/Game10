import { _decorator, Component, Node, AudioSource } from 'cc';
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

    // ─────────────────── Public API ──────────────────────────

    playWarning():      void { this._play(this.soundWarning); }
    playUnlock():       void { this._play(this.soundUnlock); }
    playCollectCoin():  void { this._play(this.soundCollectCoin); }
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
}
