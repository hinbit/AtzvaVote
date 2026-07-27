// סכמת מסד הנתונים של AtzvaVote (הצבעת אצווה) - MySQL 8 / utf8mb4
// מופעלת על-ידי `npm run db:init` (יוצר טבלאות אם לא קיימות)

module.exports = [

  // ────────── משתמשים ──────────
  `CREATE TABLE IF NOT EXISTS users (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(190)    NOT NULL UNIQUE,
    name          VARCHAR(120)    NOT NULL,
    phone_number  VARCHAR(32)     NULL,
    preferred_language VARCHAR(8) NOT NULL DEFAULT 'he',
    profile_image_url VARCHAR(500) NULL,
    department    VARCHAR(120)    NULL,
    password_hash VARCHAR(120)    NOT NULL,
    password_changed TINYINT(1)   NOT NULL DEFAULT 0,
    is_admin      TINYINT(1)      NOT NULL DEFAULT 0,
    can_guess_groups TINYINT(1)   NOT NULL DEFAULT 0,
    role          ENUM('user','manager','admin') NOT NULL DEFAULT 'user',
    is_guest      TINYINT(1)      NOT NULL DEFAULT 0,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── אצוות ──────────
  // stage: השלב הנוכחי של האצווה (growing/processing/curing/factory/marketing/sales)
  // status: active (בתהליך, פתוחה לדירוג) / finished (הוזנה תוצאה, הניקוד חולק) / cancelled
  // outcome_level: תוצאת האמת 1-5 מול יעדי המכירה שנקבעו מראש
  // quarter: הרבעון שאליו משויכת האצווה למשחק הרבעוני, למשל '2026-Q3'
  `CREATE TABLE IF NOT EXISTS batches (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    code          VARCHAR(40)     NOT NULL UNIQUE,
    name          VARCHAR(160)    NOT NULL,
    name_en       VARCHAR(160)    NULL,
    product_id    VARCHAR(64)     NULL,
    stage         VARCHAR(40)     NOT NULL DEFAULT 'growing',
    description   VARCHAR(500)    NULL,
    image_url     VARCHAR(500)    NULL,
    started_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rating_open   TINYINT(1)      NOT NULL DEFAULT 1,
    sales_target  INT             NULL,
    sold_units    INT             NULL,
    outcome_level TINYINT         NULL,
    quarter       VARCHAR(10)     NULL,
    status        VARCHAR(20)     NOT NULL DEFAULT 'active',
    resolved_at   DATETIME        NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_batches_status (status),
    INDEX idx_batches_quarter (quarter),
    INDEX idx_batches_stage (stage)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── דירוגי אצווה (הניחוש של כל עובד) ──────────
  // stage: התחנה שבה העובד דירג (לפי המחלקה שלו בזמן הדירוג)
  `CREATE TABLE IF NOT EXISTS batch_ratings (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    user_id       INT             NOT NULL,
    batch_id      INT             NOT NULL,
    stage         VARCHAR(40)     NOT NULL DEFAULT 'growing',
    rating        TINYINT         NOT NULL,
    points        INT             NOT NULL DEFAULT 0,
    submitted_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_batch_ratings_user_batch (user_id, batch_id),
    INDEX idx_batch_ratings_user (user_id),
    INDEX idx_batch_ratings_batch (batch_id),
    CONSTRAINT fk_batch_ratings_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
    CONSTRAINT fk_batch_ratings_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── יומן שינויי דירוג ──────────
  `CREATE TABLE IF NOT EXISTS rating_history (
    id          INT          AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL,
    batch_id    INT          NOT NULL,
    stage       VARCHAR(40)  NOT NULL,
    rating      TINYINT      NOT NULL,
    changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rh_user_batch (user_id, batch_id),
    CONSTRAINT fk_rh_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
    CONSTRAINT fk_rh_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── מוצרים (מטמון מקטלוג seach-data-api) ──────────
  `CREATE TABLE IF NOT EXISTS products (
    id            VARCHAR(64)     NOT NULL PRIMARY KEY,
    name_he       VARCHAR(200)    NOT NULL,
    name_en       VARCHAR(200)    NULL,
    brand         VARCHAR(200)    NULL,
    category      VARCHAR(80)     NULL,
    form          VARCHAR(80)     NULL,
    thc_percent   DECIMAL(5,2)    NULL,
    cbd_percent   DECIMAL(5,2)    NULL,
    terpenes      VARCHAR(300)    NULL,
    image_url     VARCHAR(500)    NULL,
    active        TINYINT(1)      NOT NULL DEFAULT 1,
    synced_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_products_name (name_he),
    INDEX idx_products_category (category)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── דירוגי מוצרים (רמה 2 - דירוג חיצוני) ──────────
  // criterion: effect / uniformity / cost_effective / flower_shape / smell / taste / overall
  `CREATE TABLE IF NOT EXISTS product_ratings (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    user_id       INT             NOT NULL,
    product_id    VARCHAR(64)     NOT NULL,
    criterion     VARCHAR(30)     NOT NULL,
    rating        TINYINT         NOT NULL,
    comment       VARCHAR(500)    NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_product_rating (user_id, product_id, criterion),
    INDEX idx_product_ratings_product (product_id),
    CONSTRAINT fk_product_ratings_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_product_ratings_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── קרבות השוואה (ראש-בראש) ──────────
  // נושאים גנריים: מוצר מול מוצר היום, מפלגות/מועמדים ב-THEME עתידי
  // criteria: רשימת קריטריונים ב-JSON, למשל ["effect","uniformity","cost_effective","flower_shape","smell"]
  `CREATE TABLE IF NOT EXISTS battles (
    id             INT             AUTO_INCREMENT PRIMARY KEY,
    title          VARCHAR(200)    NOT NULL,
    subject_a_label VARCHAR(160)   NOT NULL,
    subject_b_label VARCHAR(160)   NOT NULL,
    subject_a_product_id VARCHAR(64) NULL,
    subject_b_product_id VARCHAR(64) NULL,
    subject_a_image VARCHAR(500)   NULL,
    subject_b_image VARCHAR(500)   NULL,
    criteria       TEXT            NOT NULL,
    status         ENUM('open','closed') NOT NULL DEFAULT 'open',
    winner         ENUM('a','b','tie') NULL,
    created_by     INT             NULL,
    closes_at      DATETIME        NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_battles_status (status),
    CONSTRAINT fk_battles_creator   FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_battles_product_a FOREIGN KEY (subject_a_product_id) REFERENCES products(id) ON DELETE SET NULL,
    CONSTRAINT fk_battles_product_b FOREIGN KEY (subject_b_product_id) REFERENCES products(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS battle_votes (
    id          INT          AUTO_INCREMENT PRIMARY KEY,
    battle_id   INT          NOT NULL,
    user_id     INT          NOT NULL,
    criterion   VARCHAR(30)  NOT NULL,
    pick        ENUM('a','b') NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_battle_vote (battle_id, user_id, criterion),
    INDEX idx_battle_votes_battle (battle_id),
    CONSTRAINT fk_battle_votes_battle FOREIGN KEY (battle_id) REFERENCES battles(id) ON DELETE CASCADE,
    CONSTRAINT fk_battle_votes_user   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── חנות פרסים בעד נקודות ──────────
  `CREATE TABLE IF NOT EXISTS prizes (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(160)    NOT NULL,
    description   VARCHAR(500)    NULL,
    image_url     VARCHAR(500)    NULL,
    cost_points   INT             NOT NULL,
    stock         INT             NULL,
    active        TINYINT(1)      NOT NULL DEFAULT 1,
    sort_order    INT             NOT NULL DEFAULT 0,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_prizes_active (active, sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // status: pending (הוזמן) / approved / delivered / cancelled (הנקודות מוחזרות)
  `CREATE TABLE IF NOT EXISTS redemptions (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    prize_id      INT             NOT NULL,
    user_id       INT             NOT NULL,
    cost_points   INT             NOT NULL,
    status        ENUM('pending','approved','delivered','cancelled') NOT NULL DEFAULT 'pending',
    handled_by    INT             NULL,
    handled_at    DATETIME        NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_redemptions_user (user_id),
    INDEX idx_redemptions_status (status),
    CONSTRAINT fk_redemptions_prize   FOREIGN KEY (prize_id)   REFERENCES prizes(id) ON DELETE CASCADE,
    CONSTRAINT fk_redemptions_user    FOREIGN KEY (user_id)    REFERENCES users(id)  ON DELETE CASCADE,
    CONSTRAINT fk_redemptions_handler FOREIGN KEY (handled_by) REFERENCES users(id)  ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── לוז ופרסי תקופה ──────────
  `CREATE TABLE IF NOT EXISTS schedule_items (
    id              INT             AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(160)    NOT NULL UNIQUE,
    date_label      VARCHAR(120)    NOT NULL,
    description     VARCHAR(255)    NOT NULL,
    start_at        DATETIME        NOT NULL,
    end_at          DATETIME        NOT NULL,
    sort_order      INT             NOT NULL DEFAULT 0,
    prize_slot      TINYINT         NULL,
    prize_image_url VARCHAR(500)    NULL,
    winner_user_id  INT             NULL,
    popup_enabled   TINYINT(1)      NOT NULL DEFAULT 0,
    popup_title     VARCHAR(160)    NULL,
    popup_image_url VARCHAR(500)    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_schedule_sort (sort_order, start_at),
    INDEX idx_schedule_prize (prize_slot),
    CONSTRAINT fk_schedule_winner FOREIGN KEY (winner_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── מסמכי פוטר + צור קשר ──────────
  `CREATE TABLE IF NOT EXISTS footer_documents (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    doc_key       VARCHAR(40)     NOT NULL UNIQUE,
    label         VARCHAR(120)    NOT NULL,
    file_url      VARCHAR(500)    NULL,
    file_type     VARCHAR(20)     NOT NULL DEFAULT 'pdf',
    sort_order    INT             NOT NULL DEFAULT 0,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_footer_docs_sort (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS contact_messages (
    id            INT             AUTO_INCREMENT PRIMARY KEY,
    user_id       INT             NULL,
    name          VARCHAR(120)    NOT NULL,
    phone_number  VARCHAR(32)     NULL,
    message       TEXT            NOT NULL,
    image_url     VARCHAR(500)    NULL,
    handled_at    DATETIME        NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contact_created (created_at),
    CONSTRAINT fk_contact_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── פאנלים קבוצתיים (Guess-Groups) ──────────
  // קבוצת ניחוש: מספר חברים מנחשים יחד את רמת ההצלחה של אצוות
  `CREATE TABLE IF NOT EXISTS guess_groups (
    id             INT             AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(120)    NOT NULL,
    description    VARCHAR(255)    NULL,
    leader_user_id INT             NOT NULL,
    entry_cost     INT             NOT NULL DEFAULT 0,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_guess_groups_leader (leader_user_id),
    CONSTRAINT fk_guess_groups_leader FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS guess_group_members (
    id         INT      AUTO_INCREMENT PRIMARY KEY,
    group_id   INT      NOT NULL,
    user_id    INT      NOT NULL,
    role       ENUM('leader','member') NOT NULL DEFAULT 'member',
    paid_points INT     NOT NULL DEFAULT 0,
    joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_group_member (group_id, user_id),
    INDEX idx_group_member_user (user_id),
    CONSTRAINT fk_group_member_group FOREIGN KEY (group_id) REFERENCES guess_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_group_member_user  FOREIGN KEY (user_id)  REFERENCES users(id)        ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ניחוש קבוצתי של רמת הצלחת אצווה (1-5). points = בונוס הקבוצה לאחר פתרון האצווה
  `CREATE TABLE IF NOT EXISTS guess_group_bets (
    id          INT      AUTO_INCREMENT PRIMARY KEY,
    group_id    INT      NOT NULL,
    batch_id    INT      NOT NULL,
    guess_level TINYINT  NOT NULL,
    points      INT      NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_group_batch (group_id, batch_id),
    INDEX idx_group_bet_batch (batch_id),
    CONSTRAINT fk_group_bet_group FOREIGN KEY (group_id) REFERENCES guess_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_group_bet_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS email_campaigns (
    id                    INT             AUTO_INCREMENT PRIMARY KEY,
    created_by_user_id    INT             NULL,
    subject               VARCHAR(255)    NOT NULL,
    body                  MEDIUMTEXT      NOT NULL,
    include_login_details TINYINT(1)      NOT NULL DEFAULT 0,
    department_filter     VARCHAR(120)    NULL,
    recipient_count       INT             NOT NULL DEFAULT 0,
    attachments_json      MEDIUMTEXT      NULL,
    user_delivery_mode    VARCHAR(20)     NOT NULL DEFAULT 'smtp',
    sender_email          VARCHAR(190)    NULL,
    manager_email         VARCHAR(190)    NULL,
    manager_report_sent   TINYINT(1)      NOT NULL DEFAULT 0,
    created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_campaigns_created (created_at),
    CONSTRAINT fk_email_campaigns_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    id                 INT             AUTO_INCREMENT PRIMARY KEY,
    campaign_id        INT             NOT NULL,
    user_id            INT             NULL,
    recipient_name     VARCHAR(120)    NULL,
    recipient_email    VARCHAR(190)    NOT NULL,
    recipient_phone    VARCHAR(32)     NULL,
    recipient_department VARCHAR(120)  NULL,
    status             VARCHAR(20)     NOT NULL DEFAULT 'pending',
    error_message      TEXT            NULL,
    sent_at            DATETIME        NULL,
    created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email_recipients_campaign (campaign_id),
    INDEX idx_email_recipients_status (status),
    CONSTRAINT fk_email_recipients_campaign FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_email_recipients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── תרגומים ──────────
  `CREATE TABLE IF NOT EXISTS translations (
    id                INT             AUTO_INCREMENT PRIMARY KEY,
    translation_key   VARCHAR(160)    NOT NULL,
    language_code     VARCHAR(8)      NOT NULL,
    translation_value TEXT            NOT NULL,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_translations_key_lang (translation_key, language_code),
    INDEX idx_translations_lang (language_code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── הגדרות מערכת ──────────
  `CREATE TABLE IF NOT EXISTS settings (
    \`key\`   VARCHAR(80)    NOT NULL PRIMARY KEY,
    \`value\` TEXT           NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── ריביו קולי על אצווה (חוות טעימה) ──────────
  // pred_level: הדירוג 1-5 שהמשתמש בחר לצרף לריביו
  `CREATE TABLE IF NOT EXISTS batch_reviews (
    id                 INT             AUTO_INCREMENT PRIMARY KEY,
    user_id            INT             NOT NULL,
    batch_id           INT             NOT NULL,
    audio_url          VARCHAR(500)    NULL,
    transcript         TEXT            NULL,
    body               TEXT            NOT NULL,
    body_en            TEXT            NULL,
    body_ar            TEXT            NULL,
    include_prediction TINYINT(1)      NOT NULL DEFAULT 0,
    pred_level         TINYINT         NULL,
    status             ENUM('draft','published') NOT NULL DEFAULT 'published',
    coins_awarded      INT             NOT NULL DEFAULT 0,
    created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_batch_reviews_user_batch (user_id, batch_id),
    INDEX idx_batch_reviews_batch (batch_id),
    INDEX idx_batch_reviews_user (user_id),
    CONSTRAINT fk_batch_reviews_user  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
    CONSTRAINT fk_batch_reviews_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── הימורי מטבעות ("שיחים") ──────────
  // ארנק מטבעות לכל משתמש (יתרת פתיחה 10,000)
  `CREATE TABLE IF NOT EXISTS coin_wallets (
    user_id        INT      NOT NULL PRIMARY KEY,
    balance        INT      NOT NULL DEFAULT 10000,
    challenge_open TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_coin_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // הימור 1:1 על הצלחת אצווה: success = תוצאה 4-5, fail = תוצאה 1-3
  `CREATE TABLE IF NOT EXISTS coin_bets (
    id             INT          AUTO_INCREMENT PRIMARY KEY,
    batch_id       INT          NOT NULL,
    market         VARCHAR(20)  NOT NULL DEFAULT 'success',
    proposition    ENUM('success','fail') NOT NULL,
    stake          INT          NOT NULL,
    creator_id     INT          NOT NULL,
    opponent_id    INT          NULL,
    target_user_id INT          NULL,
    max_acceptors  INT          NOT NULL DEFAULT 1,
    accepted_count INT          NOT NULL DEFAULT 0,
    status         ENUM('open','matched','settled','cancelled','void') NOT NULL DEFAULT 'open',
    winner_id      INT          NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at     DATETIME      NULL,
    updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_coin_bets_batch (batch_id),
    INDEX idx_coin_bets_status (status),
    INDEX idx_coin_bets_creator (creator_id),
    INDEX idx_coin_bets_opponent (opponent_id),
    CONSTRAINT fk_coin_bets_batch    FOREIGN KEY (batch_id)       REFERENCES batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_coin_bets_creator  FOREIGN KEY (creator_id)     REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_coin_bets_opponent FOREIGN KEY (opponent_id)    REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_coin_bets_target   FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // משתתפים בהימור רב-מקבלים (כל מקבל מהמר נגד היוצר בסכום שווה)
  `CREATE TABLE IF NOT EXISTS coin_bet_participants (
    id          INT          AUTO_INCREMENT PRIMARY KEY,
    bet_id      INT          NOT NULL,
    opponent_id INT          NOT NULL,
    stake       INT          NOT NULL,
    won         TINYINT(1)   NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bet_opponent (bet_id, opponent_id),
    INDEX idx_cbp_bet (bet_id),
    INDEX idx_cbp_opponent (opponent_id),
    CONSTRAINT fk_cbp_bet      FOREIGN KEY (bet_id)      REFERENCES coin_bets(id) ON DELETE CASCADE,
    CONSTRAINT fk_cbp_opponent FOREIGN KEY (opponent_id) REFERENCES users(id)     ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ספר חשבונות (audit) לכל תזוזת מטבעות
  `CREATE TABLE IF NOT EXISTS coin_transactions (
    id            INT          AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    amount        INT          NOT NULL,
    reason        VARCHAR(40)   NOT NULL,
    bet_id        INT          NULL,
    balance_after INT          NOT NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_coin_tx_user (user_id),
    INDEX idx_coin_tx_bet (bet_id),
    CONSTRAINT fk_coin_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // הימורים מיוחדים כן/לא מול משתמש אחר (למשל: אצוות הרבעון, ובעתיד נושאי THEME)
  `CREATE TABLE IF NOT EXISTS coin_special_bets (
    id            INT          AUTO_INCREMENT PRIMARY KEY,
    creator_id    INT          NOT NULL,
    market        VARCHAR(40)  NOT NULL,
    subject_code  VARCHAR(60)  NOT NULL,
    subject_label VARCHAR(120) NOT NULL,
    proposition   ENUM('yes','no') NOT NULL,
    stake         INT          NOT NULL,
    status        ENUM('open','matched','settled','void') NOT NULL DEFAULT 'open',
    opponent_id   INT          NULL,
    creator_won   TINYINT(1)   NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at    DATETIME      NULL,
    INDEX idx_csb_status (status),
    INDEX idx_csb_creator (creator_id),
    CONSTRAINT fk_csb_creator  FOREIGN KEY (creator_id)  REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_csb_opponent FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // הצבעות על ריביו (שמעתי/אהבתי) — מזכות את הכותב במטבעות
  `CREATE TABLE IF NOT EXISTS review_votes (
    id            INT          AUTO_INCREMENT PRIMARY KEY,
    review_id     INT          NOT NULL,
    voter_user_id INT          NOT NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_review_vote (review_id, voter_user_id),
    INDEX idx_review_vote_review (review_id),
    CONSTRAINT fk_review_vote_review FOREIGN KEY (review_id)     REFERENCES batch_reviews(id) ON DELETE CASCADE,
    CONSTRAINT fk_review_vote_user   FOREIGN KEY (voter_user_id) REFERENCES users(id)         ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // ────────── סימולציה: משתמשים וירטואליים (בוטים) ──────────
  // הטבלה נשמרת לתאימות שאילתות הליגה; שירות הסימולציה הוסר בהסבה
  `CREATE TABLE IF NOT EXISTS sim_users (
    user_id     INT          NOT NULL PRIMARY KEY,
    strategy    VARCHAR(40)  NOT NULL DEFAULT 'random',
    persona     TEXT         NULL,
    enabled     TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sim_users_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`

];
