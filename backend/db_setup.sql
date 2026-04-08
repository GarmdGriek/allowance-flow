--
-- Allowance Flow - Full Database Setup
-- Run this on a fresh Neon database to create schema + restore data
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    weekly_summary_enabled BOOLEAN DEFAULT FALSE,
    weekly_summary_day INTEGER DEFAULT 0,
    weekly_summary_hour INTEGER DEFAULT 18
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
    family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    name TEXT,
    language_preference TEXT,
    phone_number TEXT,
    email TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    value NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending_approval', 'completed', 'paid', 'archived')),
    created_by TEXT NOT NULL,
    completed_by TEXT,
    family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    assigned_to_user_id TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_days JSONB,
    parent_task_id UUID,
    auto_recreate BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS family_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('parent', 'child')),
    invite_code TEXT UNIQUE NOT NULL,
    invited_name TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_by TEXT,
    used_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT,
    notification_type TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_family_id ON tasks(family_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_family_id ON user_profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_family_invites_invite_code ON family_invites(invite_code);

-- ============================================================
-- DATA RESTORE
-- ============================================================

-- Families
TRUNCATE TABLE families CASCADE;
INSERT INTO families (id, name, language, created_at, updated_at, weekly_summary_enabled, weekly_summary_day, weekly_summary_hour) VALUES ('imset_larvik', 'Family imset_larvik', 'nb', '2025-11-11 07:04:02.311370+00:00', '2025-11-12 10:06:50.178026+00:00', FALSE, 0, 18);

-- User Profiles
TRUNCATE TABLE user_profiles CASCADE;
INSERT INTO user_profiles (user_id, role, family_id, created_at, updated_at, currency, status, name, language_preference, phone_number, email) VALUES ('mock_child_456', 'child', 'imset_larvik', '2025-11-10 07:24:26.657888+00:00', '2025-11-23 11:41:05.190631+00:00', 'USD', 'active', 'Child', NULL, '99999999', NULL);
INSERT INTO user_profiles (user_id, role, family_id, created_at, updated_at, currency, status, name, language_preference, phone_number, email) VALUES ('cede47d8-6ba8-4a20-b647-f0315570f6b2', 'parent', 'imset_larvik', '2025-11-10 07:39:12.600178+00:00', '2025-11-24 09:46:47.729124+00:00', 'NOK', 'active', NULL, NULL, NULL, NULL);
INSERT INTO user_profiles (user_id, role, family_id, created_at, updated_at, currency, status, name, language_preference, phone_number, email) VALUES ('test_child_001', 'child', 'imset_larvik', '2025-11-10 09:45:00.794140+00:00', '2025-11-22 20:41:03.573314+00:00', 'NOK', 'active', 'testbruker', NULL, '12345678', NULL);

-- Tasks
TRUNCATE TABLE tasks CASCADE;
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('a7bd122e-a68a-477f-b7c9-1fcf9c4a943a', 'Rydde garasjen - 20 dager siden', 'Organisere og rydde i garasjen', 100.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-10-22 09:47:42.395558+00:00', '2025-11-11 10:52:47.111156+00:00', '2025-10-22 09:47:42.395558+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-11-11 10:52:47.111156+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('93840da2-6c18-4bc4-b975-46e012c2a9d2', 'Mate hunden - 18 dager siden', 'Mate hunden og fylle på vann', 20.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'test_child_001', 'imset_larvik', '2025-10-24 09:47:42.395558+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-10-24 09:47:42.395558+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-10-24 09:47:42.395558+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('b13fcbb9-39cb-485c-be18-8fa0a5c7814c', 'Handle mat - 16 dager siden', 'Hjelpe med handleturen', 60.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'test_child_001', 'imset_larvik', '2025-10-26 09:47:42.395558+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-10-26 09:47:42.395558+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-10-26 09:47:42.395558+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('405f714b-2624-47c0-8b6b-5bddef8574d9', 'Vaske kjøkken - 15 dager siden', 'Vaske benker og rydde kjøkkenet', 40.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-10-27 09:47:42.395558+00:00', '2025-11-11 10:52:43.000175+00:00', '2025-10-27 09:47:42.395558+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-11-11 10:52:43.000175+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('a5318abd-33eb-4832-aece-c19ba365f85a', 'Tømme oppvaskmaskin - 12 dager siden', 'Tøm oppvaskmaskinen og sett alt på plass', 25.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'test_child_001', 'imset_larvik', '2025-10-30 09:47:31.144334+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-10-30 09:47:31.144334+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-10-30 09:47:31.144334+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('56fcd040-85f9-4271-a931-278151f3b424', 'Vaske rom - 10 dager siden', 'Vask og rydde rommet grundig', 50.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-01 09:47:31.144334+00:00', '2025-11-11 10:04:55.677837+00:00', '2025-11-01 09:47:31.144334+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-11-11 10:04:55.677837+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('6b130089-dd9c-45cd-8ebc-a6adffbb62bc', 'Støvsuge stue - 10 dager siden', 'Støvsug hele stua', 30.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'test_child_001', 'imset_larvik', '2025-11-01 09:47:31.144334+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-01 09:47:31.144334+00:00', 'test_child_001', FALSE, NULL, NULL, FALSE, '2025-11-01 09:47:31.144334+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('96f26d35-0a9c-40ca-adb4-c875d769e200', 'fsdafasfd', NULL, 15.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-10 15:10:15.133842+00:00', '2025-11-10 15:22:45.102535+00:00', NULL, 'mock_child_456', FALSE, NULL, NULL, FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('2480f38c-7ba5-4b4f-b6da-bf9db2af0ec2', 't4est', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 15:22:20.497583+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 16:26:03.030900+00:00', 'mock_child_456', FALSE, NULL, '136b93f6-3b1e-43d0-b0ca-2593e6ea6515', FALSE, '2025-11-10 16:26:03.030900+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('8989f20b-1f15-427f-a8ae-846b335f1fc4', 'fsdafasfd', NULL, 15.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 15:22:58.818408+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 15:25:19.678665+00:00', 'mock_child_456', FALSE, NULL, '810659fb-0b15-42fd-b125-8c1f868ad0d7', FALSE, '2025-11-10 15:25:19.678665+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('cf4d595c-4d9f-4501-8d26-a6083eece812', 'test', NULL, 2.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 15:23:07.745510+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 15:25:16.725906+00:00', 'mock_child_456', FALSE, NULL, '85e37d2e-1703-4baa-8b0a-234fb2318d0d', FALSE, '2025-11-10 15:25:16.725906+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('07d2711c-5cbb-40f4-9d40-db062e215465', 'Tømme søppel', NULL, 5.00, 'available', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-10 15:25:49.159420+00:00', '2025-11-10 15:25:49.159420+00:00', NULL, 'mock_child_456', TRUE, '[0, 1, 2, 3, 4, 5, 6]'::jsonb, NULL, FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('161fd3a8-7e39-4cdf-9d74-2ff94803313b', 'Tømme søppel', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 15:45:44.265757+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 15:51:08.632103+00:00', 'mock_child_456', FALSE, NULL, '07d2711c-5cbb-40f4-9d40-db062e215465', FALSE, '2025-11-10 15:51:08.632103+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('b7f46142-0d8d-4d12-b209-42c0f95fd358', 'tre', NULL, 1.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 15:45:44.380426+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 16:23:17.498493+00:00', 'mock_child_456', FALSE, NULL, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, '2025-11-10 16:23:17.498493+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('a2d60fbe-e786-4653-a135-723d2c834cb7', 'Banneord', NULL, 5.00, 'archived', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 16:21:27.518871+00:00', '2025-11-10 16:22:46.724269+00:00', '2025-11-10 16:22:46.724269+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('24b2cc5b-5028-443e-bee2-1084fb060d6a', 'Banneord', NULL, 5.00, 'archived', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 16:22:46.756222+00:00', '2025-11-10 16:23:01.684603+00:00', '2025-11-10 16:23:01.684603+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('d373f7dd-4eb5-4e1f-a740-c73c2e5ff7fd', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 16:23:01.706123+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 16:26:00.369308+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-10 16:26:00.369308+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('486f362b-a7a7-4994-b424-f59151aad7a9', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 16:25:37.529408+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 16:26:01.059143+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-10 16:26:01.059143+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('e14b9c60-0c5c-4ab3-a81d-b349c0fc9d34', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 16:25:43.895355+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-10 16:26:01.779694+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-10 16:26:01.779694+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('3ba8d0b7-a83c-48b1-98de-2265fe0528fd', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-10 16:25:47.293335+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-11 08:46:06.525001+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-11 08:46:06.525001+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('a82dc6c4-65b3-42dc-8fc9-062cf2ad8e60', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-11 08:45:50.195403+00:00', '2025-11-11 10:02:06.422751+00:00', '2025-11-11 08:46:03.437148+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-11 08:46:03.437148+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('3f8d9936-d43e-4383-9a21-ced6187148dc', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-11 08:45:54.196450+00:00', '2025-11-28 06:36:29.427745+00:00', '2025-11-27 13:06:25.660003+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-28 06:36:29.427745+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('dc91a527-eb7a-4c73-937e-36096956c077', 'tre', NULL, 4.00, 'archived', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-22 10:04:40.058834+00:00', '2025-11-27 12:56:09.855721+00:00', '2025-11-27 12:56:09.855721+00:00', 'mock_child_456', TRUE, '[3]'::jsonb, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('858949e8-46df-4068-aecb-0acf5b9e83f1', 'Tømme søppel', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-22 10:04:40.197236+00:00', '2025-11-25 06:06:39.384876+00:00', '2025-11-22 20:41:27.900824+00:00', 'mock_child_456', FALSE, NULL, '07d2711c-5cbb-40f4-9d40-db062e215465', FALSE, '2025-11-25 06:06:39.384876+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('1417b0aa-e3ec-4a38-a07b-28b0b7d95952', 'test mandag onsdag', NULL, 5.00, 'available', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-25 06:04:14.399679+00:00', '2025-11-25 06:04:14.399679+00:00', NULL, 'mock_child_456', TRUE, '[1, 3]'::jsonb, NULL, FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('6accba27-f0e2-4d3f-a0cb-fb4e2136b27f', 'test tirsdag torsdag', NULL, 5.00, 'available', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-25 06:04:44.592574+00:00', '2025-11-25 06:04:44.592574+00:00', NULL, 'test_child_001', TRUE, '[2, 4]'::jsonb, NULL, FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('746a6a5b-0ad5-4867-a533-e6dfca54969a', 'Test helg', NULL, 5.00, 'available', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-25 06:05:04.280169+00:00', '2025-11-25 06:05:04.280169+00:00', NULL, 'test_child_001', TRUE, '[0, 5, 6]'::jsonb, NULL, FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('5fac3d4a-e2fd-4d13-97f0-06f65d8c894a', 'tre', NULL, 4.00, 'completed', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 12:56:09.887705+00:00', '2025-11-27 13:00:15.531684+00:00', '2025-11-27 13:00:01.647764+00:00', 'mock_child_456', TRUE, '[3]'::jsonb, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('2b1709af-1c08-488b-ba18-1e08f3e0da58', 'tre', NULL, 4.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:00:01.669042+00:00', '2025-11-28 06:36:25.135784+00:00', '2025-11-27 13:00:39.418760+00:00', 'mock_child_456', TRUE, '[3]'::jsonb, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, '2025-11-28 06:36:25.135784+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('82584287-9ab9-4935-a109-e740b03a2be9', 'tre', NULL, 4.00, 'archived', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:00:39.439443+00:00', '2025-11-27 13:06:05.652538+00:00', '2025-11-27 13:06:05.652538+00:00', 'mock_child_456', TRUE, '[3]'::jsonb, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('73c46f47-8db2-4441-8eed-7f4bd980be8f', 'tre', NULL, 4.00, 'archived', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:06:05.676518+00:00', '2025-11-27 13:08:24.788213+00:00', '2025-11-27 13:08:24.788213+00:00', 'mock_child_456', TRUE, '[3]'::jsonb, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('485842dc-0011-42e7-9a8e-94134a294826', 'Banneord', NULL, 5.00, 'completed', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:06:25.680530+00:00', '2025-11-27 13:08:15.390020+00:00', '2025-11-27 13:08:15.390020+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('d64eae13-28c0-43e9-9629-9634745c95d4', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:08:15.410534+00:00', '2025-11-28 06:36:21.248001+00:00', '2025-11-27 13:12:09.564383+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-28 06:36:21.248001+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('b32e65c1-b7d2-4854-b495-e1a1fef12892', 'tre', NULL, 4.00, 'available', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-27 13:08:24.813496+00:00', '2025-11-27 13:08:24.813496+00:00', NULL, 'mock_child_456', TRUE, '[3]'::jsonb, 'be3840ed-72a9-41df-91d0-37d274f2e89b', FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('630fb46d-9083-43d7-9a35-bb0595258e2e', 'test', NULL, 5.00, 'completed', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:08:41.342682+00:00', '2025-11-27 13:08:46.869601+00:00', '2025-11-27 13:08:46.869601+00:00', 'mock_child_456', FALSE, NULL, NULL, FALSE, NULL);
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('d3e72a65-a9a0-425f-ba74-bd886a12aca6', 'test', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:08:58.241991+00:00', '2025-11-27 13:12:17.649546+00:00', '2025-11-27 13:09:06.442821+00:00', 'mock_child_456', FALSE, NULL, NULL, FALSE, '2025-11-27 13:12:17.649546+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('47215811-f20d-4a3e-a7aa-9fdb5f4248bf', 'Banneord', NULL, 5.00, 'paid', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', 'imset_larvik', '2025-11-27 13:12:09.587956+00:00', '2025-11-28 06:36:16.827947+00:00', '2025-11-28 06:36:03.684454+00:00', 'mock_child_456', FALSE, NULL, NULL, TRUE, '2025-11-28 06:36:16.827947+00:00');
INSERT INTO tasks (id, title, description, value, status, created_by, completed_by, family_id, created_at, updated_at, completed_at, assigned_to_user_id, is_recurring, recurrence_days, parent_task_id, auto_recreate, paid_at) VALUES ('3b400e62-74e9-406a-ad99-66b69115fb9a', 'Banneord', NULL, 5.00, 'available', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', NULL, 'imset_larvik', '2025-11-28 06:36:03.718824+00:00', '2025-11-28 06:36:03.718824+00:00', NULL, 'mock_child_456', FALSE, NULL, NULL, TRUE, NULL);

-- Family Invites
TRUNCATE TABLE family_invites CASCADE;
INSERT INTO family_invites (id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at) VALUES ('31563832-ffbc-4262-955e-0896bbe4705d', 'imset_larvik', 'parent', 'inv_rJ3ogMICPGB8zcSN', 'Nadia', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', '2025-11-10 08:38:49.080275+00:00', NULL, NULL, TRUE, '2025-11-10 08:39:29.286118+00:00');
INSERT INTO family_invites (id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at) VALUES ('2b2023b4-f8ad-4957-ac71-ca1e05b96a68', 'imset_larvik', 'child', 'inv_aDRMRUXKWvqFz5Eb', 'Vårin', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', '2025-11-10 08:40:50.077689+00:00', NULL, NULL, TRUE, '2025-11-10 08:42:51.009114+00:00');
INSERT INTO family_invites (id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at) VALUES ('382f33c9-d2dd-4d7c-9e28-6c4cfa4e4ff6', 'imset_larvik', 'parent', 'inv_zCGuCjVuxyGNqCff', 'Nadia', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', '2025-11-10 08:41:01.129392+00:00', NULL, NULL, TRUE, '2025-11-10 08:42:47.960675+00:00');
INSERT INTO family_invites (id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at) VALUES ('00cfa533-ea7f-4bea-b09d-a77ff34d55d2', 'imset_larvik', 'child', 'inv_qSUBq0idWG-CvPzB', 'Vårin', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', '2025-11-10 08:44:39.840490+00:00', NULL, NULL, TRUE, '2025-11-10 08:49:48.176706+00:00');
INSERT INTO family_invites (id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at) VALUES ('8a8271a5-8d42-4163-8061-da4995f84fcd', 'imset_larvik', 'child', 'inv_rH3uQkYl1pjzg4di', 'Vårin', 'cede47d8-6ba8-4a20-b647-f0315570f6b2', '2025-11-10 09:30:49.451376+00:00', NULL, NULL, TRUE, '2025-11-10 09:31:03.956849+00:00');
INSERT INTO family_invites (id, family_id, role, invite_code, invited_name, created_by, created_at, used_by, used_at, revoked, revoked_at) VALUES ('1d9835d3-bd94-4e46-a787-dc3a6f6505e3', 'imset_larvik', 'child', 'jjQ0hFPucWCqqsYUXWCC6g', 'test!', 'mock_parent_123', '2025-11-10 09:43:00.924193+00:00', NULL, NULL, FALSE, NULL);

-- Setup complete
