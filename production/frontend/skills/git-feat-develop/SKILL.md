---
name: git-feat-develop
description: Automates story-based development: validates story.md, manages branches, implements tasks, and handles standardized commits/pushes. Invoke for feature dev.
---

# Git Feature Development Skill

This skill automates the feature development workflow based on a `story.md` file.

## Usage

Invoke this skill when the user provides a `story.md` file path and asks to start development or to commit changes, or explicitly mentions `git-feat-develop`.

## Workflow Steps

### 1. Validate Story Frontmatter

- **Action**: Read the provided `story.md`.
- **Check frontmatter**: Ensure the YAML frontmatter contains:
  - `version`: The target version (e.g., `v1.10.0`).
  - `tapd`: The TAPD task info (e.g., `--story=...`).
  - If the user just asks to commit changes, skip to step 4.
- **Check task todo**: Ensure the "Task List" section contains at least one task with a todo item (e.g., `- [ ] Task 1`).
- **Failure**: If fields are missing, inform the user and stop.


### 2. Create Feature Branch

- **Check branch**: Check whether the current branch is exactly the feature branch which meets the story's title and version, or user specifies the branch. If so, go to step 3.
- **Source**: Use user's specific branch as source or construct the source branch name: `${version}/version`.
- **Target**: Create a new feature branch.
  - Branch format: `${app}/${version}/${user}/feat-${story-desc-for-short}`, lowercase
  - Get `user` from `git config user.name` or the `tapd` info. Omit `user` path if missed.
  - Check `story.md` path to see which app the story is belonging to (`apps/dgi`, `apps/lab`, etc.). If none, that means it's a common feature. Omit the `/${app}` path if the app is not found.
  - Suggest a name based on the story title and `user` (e.g., `dgi/v1.10.0/zcq/feat-console-integration`).
- **Git Commands**:
  - `git fetch origin`
  - `git checkout ${version}/version` (or `origin/${version}/version` if local doesn't exist)
  - `git checkout -b <feature_branch_name>`
- **Failure**:
  

### 3. Analyze and Develop

- **Analyze**: Read the "Background", "Goal", and "Task List" sections of `story.md`.
- **Plan**: Create a plan for implementation. Focus on the tasks with todo items or specified by the user.
- **Develop**: Write code to satisfy the requirements.
- **Test**: Verify changes (compile, run tests if applicable).

### 4. Commit Changes

- **Trigger**: When a task is completed or user requests a commit.
- **Update Story**:
  - Mark the relevant task in `story.md` as done (change `- [ ]` to `- [x]`).
- **Determine Scope**:
  - Set `${scope}` to the scope of the work done (e.g., `dgi`, `lab`D`).
- **Commit Message**:
  - Format: `feat(${scope}): ${task_summary} ${tapd}`
  - `${scope}`: The scope of the work done. If the scope is not found, omit it.
  - `${task_summary}`: Brief summary of the work done.
  - `${tapd}`: The value from the `tapd` frontmatter field.
- **Action**:
  - `git add .` (including `story.md`)
  - `git commit -m "${commit_message}"`
- **Never**: Never list or describe the committed changes in the response. Just say "Commit successful".

### 5. Push to Remote

- **Condition**: 
  - ALL tasks in `story.md` are marked as completed, OR
  - User explicitly asks to push.
- **Action**: `git push origin <feature_branch_name>`
