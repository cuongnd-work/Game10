import { Node } from 'cc';

/** Tiền thay đổi */
export class OnMoneyChanged {
    constructor(public amount: number) {}
}

/** Một car vừa đổ xăng xong (worldPos = vị trí car) */
export class OnCarRefueled {
    constructor(public carNode: Node) {}
}

/** Một slot vừa được unlock */
export class OnSlotUnlocked {
    constructor(public slotIndex: number) {}
}

/** Một attendant vừa được unlock */
export class OnAttendantUnlocked {
    constructor(public slotIndex: number) {}
}

/** Người dùng bấm Slot button */
export class OnSlotClicked {}

/** Người dùng bấm Attendant button */
export class OnAttendantClicked {}

/** Người dùng bấm Expand button */
export class OnExpandClicked {}

/** Kích hoạt CTA (bay vào store) */
export class OnTriggerCTA {}
