-- supabase_schema.sql

-- 0. UUID 拡張を有効化
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. profiles テーブル（auth.users 拡張）
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  name TEXT,
  role TEXT CHECK (role IN ('teacher','student')) DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. groups テーブル（クラス）
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  teacher_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. group_members テーブル（メンバーシップ）
CREATE TABLE group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('teacher','student')) DEFAULT 'student',
  PRIMARY KEY (group_id, user_id)
);

-- 4. assignments テーブル（課題）
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  code_example TEXT,
  output_example TEXT,
  input_filename TEXT DEFAULT 'input.txt',
  output_mode TEXT CHECK (output_mode IN ('stdout','file')) DEFAULT 'stdout',
  output_filename TEXT DEFAULT 'output.txt',
  due_date TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. test_cases テーブル（テストケース）
CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  input_data TEXT,
  expected_output TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. submissions テーブル（提出データ）
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES auth.users(id),
  code TEXT,
  language TEXT,
  passed BOOLEAN,
  score INT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student    ON submissions(student_id);

-- Row-Level Security を有効化
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions   ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー定義

-- profiles: 自分のプロフィールのみ操作可
CREATE POLICY select_self_profile ON profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY insert_self_profile ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY update_self_profile ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- groups: 教師は自分のグループを、学生は参加グループを参照可
CREATE POLICY select_own_group ON groups FOR SELECT
  USING (
    auth.uid() = teacher_id
    OR auth.uid() IN (
      SELECT user_id FROM group_members WHERE group_id = id
    )
  );
CREATE POLICY insert_group_teacher ON groups FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

-- group_members: グループの教師または当該ユーザー自身のみ参照・登録可
CREATE POLICY select_group_members ON group_members FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = (
      SELECT teacher_id
        FROM groups
       WHERE id = group_id
    )
  );
CREATE POLICY insert_group_member ON group_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() = (
      SELECT teacher_id
        FROM groups
       WHERE id = group_id
    )
  );

-- assignments: 教師は自分の課題を作成、メンバーは参照可
CREATE POLICY insert_assignment ON assignments FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY select_assignment ON assignments FOR SELECT
  USING (
    auth.uid() = created_by
    OR auth.uid() IN (
      SELECT user_id
        FROM group_members
       WHERE group_id = assignments.group_id
    )
  );

-- test_cases: 教師は登録、メンバーは参照可
CREATE POLICY insert_test_case ON test_cases FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT teacher_id
        FROM groups
        JOIN assignments ON assignments.group_id = groups.id
       WHERE assignments.id = assignment_id
    )
  );
CREATE POLICY select_test_case ON test_cases FOR SELECT
  USING (
    auth.uid() = (
      SELECT teacher_id
        FROM groups
        JOIN assignments ON assignments.group_id = groups.id
       WHERE assignments.id = test_cases.assignment_id
    )
    OR auth.uid() IN (
      SELECT user_id
        FROM group_members
       WHERE group_id = (
         SELECT group_id
           FROM assignments
          WHERE assignments.id = test_cases.assignment_id
       )
    )
  );

-- submissions: 学生は自身の提出を登録、教師・該当学生のみ参照可
CREATE POLICY insert_submission ON submissions FOR INSERT
  WITH CHECK (
    auth.uid() = student_id
    AND auth.uid() IN (
      SELECT user_id
        FROM group_members
       WHERE group_id = (
         SELECT group_id
           FROM assignments
          WHERE assignments.id = assignment_id
       )
    )
  );
CREATE POLICY select_submission ON submissions FOR SELECT
  USING (
    auth.uid() = student_id
    OR auth.uid() = (
      SELECT teacher_id
        FROM groups
        JOIN assignments ON assignments.group_id = groups.id
       WHERE assignments.id = submissions.assignment_id
    )
  );
