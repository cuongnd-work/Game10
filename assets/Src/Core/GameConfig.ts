export const GAME_CONFIG = {
    // --- Timing ---
    /**
     * Thời gian đổ xăng theo từng speed level. Index 0 = base (chưa upgrade),
     * mỗi lần upgrade speed → tăng index. Đồng bộ độ dài với SPEED_UPGRADE_COSTS
     * (SPEED_UPGRADE_COSTS.length = REFUEL_DURATION_LEVELS.length - 1).
     */
    REFUEL_DURATION_LEVELS: [3, 2, 1, 0.5],
    CAR_DRIVE_SEGMENT_DURATION: 0.5,    // giây di chuyển giữa 2 waypoint liền kề
    CAR_SPAWN_INTERVAL: 0.5,            // giây giữa 2 lần thử spawn car (đã chặn nếu đang có car vào)

    // --- Economy ---
    INITIAL_MONEY: 25,          // tiền ban đầu: đủ để mở slot 0 (20$)
    EARN_PER_REFUEL: 30,        // tiền kiếm được mỗi lần đổ xăng xong

    /** Cost để unlock slot thứ i (0-indexed). Mỗi lần mở slot cũng auto mở attendant cùng slot. */
    SLOT_UNLOCK_COSTS: [20, 30, 60, 90],

    /** Cost cho từng lần upgrade speed (tuần tự). */
    SPEED_UPGRADE_COSTS: [ 60, 90, 120],

    /** Cost để mở button fake (CTA store) sau khi mọi thứ đã unlock. */
    FAKE_UNLOCK_COST: 240,

    // --- Gas station ---
    MAX_SLOTS: 4,

    // --- UI ---
    NO_SLOT_DISPLAY_DURATION: 1.5,  // giây hiển thị text cảnh báo
    COIN_FLY_DURATION: 0.8,         // giây hiệu ứng đồng xu bay
    UPGRADE_UI_DELAY_AFTER_GIFT: 1, // giây delay show upgrade panel sau khi mở quà
    HANDTAP_IDLE_INTERVAL: 5,       // giây idle → chỉ hand-tap vào button giá cao nhất
};

/**
 * Runtime state được mutate khi player upgrade speed. Car + Attendant đọc
 * `refuelDuration` ngay tại thời điểm bắt đầu refuel → cây xăng mở sau tự
 * hưởng speed hiện tại (khớp với các cây đã mở).
 */
export const GAME_RUNTIME = {
    /** Level speed hiện tại (0..SPEED_UPGRADE_COSTS.length). */
    speedLevel: 0,
    /** Duration hiện tại (giây). Đồng bộ với REFUEL_DURATION_LEVELS[speedLevel]. */
    refuelDuration: GAME_CONFIG.REFUEL_DURATION_LEVELS[0],
};

/** Reset runtime về mặc định – gọi khi restart scene. */
export function resetGameRuntime(): void {
    GAME_RUNTIME.speedLevel = 0;
    GAME_RUNTIME.refuelDuration = GAME_CONFIG.REFUEL_DURATION_LEVELS[0];
}
