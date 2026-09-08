import { _decorator, Component, Node, UIOpacity, tween, Vec3, Label, sp, BlockInputEvents } from 'cc';
import { AudioContainer } from 'db://assets/Src/Core/AudioContainer';

const { ccclass, property } = _decorator;

@ccclass('IntroManager')
export class IntroManager extends Component {

    // ── Characters ────────────────────────────────────────────
    @property(sp.Skeleton)
    characterMale: sp.Skeleton = null!;

    @property(sp.Skeleton)
    characterFemale: sp.Skeleton = null!;

    // ── Dialog nodes (text đã có sẵn trong scene) ─────────────
    @property(Node)
    dialog1: Node = null!;      // "babe, i want a ring with diamond"

    @property(Node)
    dialog2: Node = null!;      // "so what get a job, broke-ass!"

    // ── Female move out ───────────────────────────────────────
    @property(Node)
    pointFemaleMoveOut: Node = null!;

    @property
    femaleMoveOutDuration: number = 1.0;

    @property
    femaleReactionDelay: number = 2.0;

    // ── Anim names ────────────────────────────────────────────
    @property
    maleIdleAnim: string = 'idle';

    @property
    maleSadAnim: string = 'sad';

    @property
    femaleIdleAnim: string = 'idle';

    @property
    femaleAngryAnim: string = 'angry';

    @property
    femaleWalkAnim: string = 'walk';

    // ── Shared buttons ────────────────────────────────────────
    @property(Node)
    btnLeft: Node = null!;

    @property(Node)
    btnRight: Node = null!;

    // ── Labels bên trong button ───────────────────────────────
    @property(Label)
    labelLeft: Label = null!;

    @property(Label)
    labelRight: Label = null!;

    // ── Texts scene 1 & 2 ─────────────────────────────────────
    @property
    scene1LeftText: string = 'No Money';

    @property
    scene1RightText: string = 'So what?';

    @property
    scene2LeftText: string = 'Build a company';

    @property
    scene2RightText: string = 'Go to work';

    // ── Hand tap hint ─────────────────────────────────────────
    @property(Node)
    handTap: Node = null!;

    @property(Vec3)
    handTapOffset: Vec3 = new Vec3(30, 30, 0);

    @property
    hintAlternateInterval: number = 1.5;

    // ── Audio & BGM ───────────────────────────────────────────
    @property(Node)
    audioContainerNode: Node = null!;

    /** Node BGM – bật lên khi intro kết thúc */
    @property(Node)
    bgmNode: Node = null!;

    private get audio(): AudioContainer | null {
        return this.audioContainerNode?.getComponent(AudioContainer) ?? null;
    }

    // ── Transition ────────────────────────────────────────────
    @property
    transitionDuration: number = 0.4;

    // ── Internal ──────────────────────────────────────────────
    private _scene: 1 | 2 = 1;
    private _hintIndex: number = 0;
    private _busy: boolean = false;

    // ─────────────────── Lifecycle ────────────────────────────

    protected start(): void {
        // GameplayLayer không cần đụng đến – nó active và visible từ đầu.
        // IntroLayer nằm trên che khuất, BlockInputEvents chặn input xuyên xuống.
        this.node.getComponent(BlockInputEvents) ?? this.node.addComponent(BlockInputEvents);

        this.btnLeft?.on(Node.EventType.TOUCH_END,  this._onButtonTap, this);
        this.btnRight?.on(Node.EventType.TOUCH_END, this._onButtonTap, this);

        // Anim idle ban đầu
        this._playAnim(this.characterMale,   this.maleIdleAnim,   true);
        this._playAnim(this.characterFemale, this.femaleIdleAnim, true);

        // Dialog 1 hiện, dialog 2 ẩn
        if (this.dialog1) this.dialog1.active = true;
        if (this.dialog2) this.dialog2.active = false;

        // Buttons scene 1
        this._updateButtonTexts(this.scene1LeftText, this.scene1RightText);
        this._setButtonsVisible(true);
        this._startHintAlternate();
    }

    protected onDestroy(): void {
        this.btnLeft?.off(Node.EventType.TOUCH_END,  this._onButtonTap, this);
        this.btnRight?.off(Node.EventType.TOUCH_END, this._onButtonTap, this);
    }

    // ─────────────────── Button tap ──────────────────────────

    private _onButtonTap(): void {
        if (this._busy) return;

        if (this._scene === 1) {
            this._busy = true;
            this._playFemaleReaction();
        } else {
            this._goToGameplay();
        }
    }

    // ─────────────────── Scene 1 → 2 ─────────────────────────

    private _playFemaleReaction(): void {
        this._stopHint();
        this._setButtonsVisible(false);

        // Female angry, male sad
        this._playAnim(this.characterFemale, this.femaleAngryAnim, true);
        this._playAnim(this.characterMale,   this.maleSadAnim,     true);
        this.audio?.playMaleSad();

        // Đổi dialog
        if (this.dialog1) this.dialog1.active = false;
        if (this.dialog2) this.dialog2.active = true;

        // Chờ angry xong → đợi thêm 1.5s → tắt dialog2 → flip → walk out
        this.scheduleOnce(() => {
            this.scheduleOnce(() => {
                if (this.dialog2) this.dialog2.active = false;

                // Flip nhân vật nữ sang trái để walk ra
                if (this.characterFemale) {
                    const s = this.characterFemale.node.scale;
                    this.characterFemale.node.setScale(-s.x, s.y, s.z);
                }

                this._playAnim(this.characterFemale, this.femaleWalkAnim, true);
                this._moveFemaleOut();
            }, 1.5);
        }, this.femaleReactionDelay);
    }

    private _moveFemaleOut(): void {
        const femNode = this.characterFemale?.node;
        if (!femNode) { this._enterScene2(); return; }

        let targetPos: Vec3;
        if (this.pointFemaleMoveOut) {
            const local  = new Vec3();
            const parent = femNode.parent;
            if (parent) parent.inverseTransformPoint(local, this.pointFemaleMoveOut.worldPosition);
            else Vec3.copy(local, this.pointFemaleMoveOut.worldPosition);
            targetPos = local;
        } else {
            targetPos = new Vec3(femNode.position.x + 800, femNode.position.y, femNode.position.z);
        }

        tween(femNode)
            .to(this.femaleMoveOutDuration, { position: targetPos }, { easing: 'quadIn' })
            .call(() => {
                if (this.dialog2) this.dialog2.active = false;
                this._enterScene2();
            })
            .start();
    }

    private _enterScene2(): void {
        this._scene = 2;
        this._busy  = false;

        // Male giữ nguyên anim sad, không reset về idle

        this._updateButtonTexts(this.scene2LeftText, this.scene2RightText);
        this._setButtonsVisible(true);
        this._startHintAlternate();
    }

    // ─────────────────── Scene 2 → Gameplay ──────────────────

    private _goToGameplay(): void {
        this._stopHint();

        // Bật BGM
        if (this.bgmNode) this.bgmNode.active = true;

        // Chỉ fade out IntroLayer – GameplayLayer không bị động đến
        const introOpacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        tween(introOpacity)
            .to(this.transitionDuration, { opacity: 0 })
            .call(() => { this.node.active = false; })
            .start();
    }

    // ─────────────────── Helpers ─────────────────────────────

    private _playAnim(skeleton: sp.Skeleton | null, animName: string, loop: boolean): void {
        if (!skeleton || !animName) return;
        skeleton.setAnimation(0, animName, loop);
    }

    private _updateButtonTexts(left: string, right: string): void {
        if (this.labelLeft)  this.labelLeft.string  = left;
        if (this.labelRight) this.labelRight.string = right;
    }

    private _setButtonsVisible(visible: boolean): void {
        if (this.btnLeft)  this.btnLeft.active  = visible;
        if (this.btnRight) this.btnRight.active = visible;
    }

    // ─────────────────── Hand hint ───────────────────────────

    private _startHintAlternate(): void {
        this._hintIndex = 0;
        this._showNextHint();
    }

    private _showNextHint(): void {
        if (!this.handTap) return;
        const targets = [this.btnLeft, this.btnRight].filter(n => !!n && n.active);
        if (targets.length === 0) return;

        const target = targets[this._hintIndex % targets.length];
        this._hintIndex++;
        this._pointHandAt(target);
        this.scheduleOnce(() => this._showNextHint(), this.hintAlternateInterval);
    }

    private _stopHint(): void {
        this.unscheduleAllCallbacks();
        if (this.handTap) this.handTap.active = false;
    }

    private _pointHandAt(targetNode: Node): void {
        if (!this.handTap || !targetNode) return;
        this.handTap.active = true;
        const wp = targetNode.worldPosition;
        this.handTap.worldPosition = new Vec3(
            wp.x + this.handTapOffset.x,
            wp.y + this.handTapOffset.y,
            wp.z,
        );
    }
}
