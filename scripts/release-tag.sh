#!/usr/bin/env bash
set -euo pipefail

info() {
    printf '[INFO] %s\n' "$1"
}

success() {
    printf '[OK] %s\n' "$1"
}

warn() {
    printf '[WARN] %s\n' "$1"
}

die() {
    printf '[ERROR] %s\n' "$1" >&2
    exit 1
}

check_dependencies() {
    command -v git >/dev/null 2>&1 || die "Required command not found: git"
}

ensure_git_repo() {
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Current directory is not inside a git repository"
}

ensure_main_branch() {
    local branch
    branch=$(git branch --show-current)
    [[ -n "$branch" ]] || die "Unable to determine the current branch"
    [[ "$branch" == "main" ]] || die "Releases must be created from branch 'main' (current: $branch)"
}

ensure_clean_worktree() {
    local status
    status=$(git status --porcelain --untracked-files=all)
    [[ -z "$status" ]] || die "Working tree is not clean. Commit, stash, or remove changes before releasing."
}

ensure_origin_remote() {
    git remote get-url origin >/dev/null 2>&1 || die "Git remote 'origin' is not configured"
}

detect_base_tag() {
    local tag
    tag=$(git describe --tags --abbrev=0 2>/dev/null || true)
    if [[ -z "$tag" ]]; then
        BASE_VERSION="0.0.0"
        BASE_TAG="v0.0.0"
        info "No existing tags found; using baseline version $BASE_TAG"
        return
    fi

    BASE_TAG="$tag"
    BASE_VERSION="${tag#v}"
    [[ "$BASE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Latest reachable tag '$tag' is not in vMAJOR.MINOR.PATCH format"
    info "Detected current tag: $BASE_TAG"
}

choose_bump_type() {
    local choice

    printf 'Select version bump:\n'
    printf '  1) major\n'
    printf '  2) minor\n'
    printf '  3) patch\n'

    while true; do
        read -r -p "Choose [1-3]: " choice
        case "$choice" in
            1 | major)
                BUMP_TYPE="major"
                return
                ;;
            2 | minor)
                BUMP_TYPE="minor"
                return
                ;;
            3 | patch)
                BUMP_TYPE="patch"
                return
                ;;
            *)
                warn "Invalid selection. Enter 1, 2, 3, major, minor, or patch."
                ;;
        esac
    done
}

compute_next_tag() {
    local major minor patch
    IFS='.' read -r major minor patch <<<"$BASE_VERSION"

    case "$BUMP_TYPE" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            die "Unsupported bump type: $BUMP_TYPE"
            ;;
    esac

    NEW_TAG="v${major}.${minor}.${patch}"
}

ensure_tag_does_not_exist() {
    if git rev-parse -q --verify "refs/tags/$NEW_TAG" >/dev/null 2>&1; then
        die "Tag '$NEW_TAG' already exists locally"
    fi

    if git ls-remote --exit-code --tags --refs origin "refs/tags/$NEW_TAG" >/dev/null 2>&1; then
        die "Tag '$NEW_TAG' already exists on origin"
    fi
}

confirm_release() {
    local response
    printf '\n'
    warn "Pushing $NEW_TAG will trigger the tag-based release workflow."
    read -r -p "Create and push tag $NEW_TAG to origin? [y/N] " response
    [[ "$response" =~ ^[Yy]$ ]]
}

create_and_push_tag() {
    git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
    success "Created tag: $NEW_TAG"

    git push origin "$NEW_TAG"
    success "Pushed tag to origin: $NEW_TAG"
}

main() {
    check_dependencies
    ensure_git_repo
    ensure_main_branch
    ensure_clean_worktree
    ensure_origin_remote
    detect_base_tag

    info "Current branch: $(git branch --show-current)"
    choose_bump_type
    info "Selected bump type: $BUMP_TYPE"

    compute_next_tag
    info "Computed next tag: $NEW_TAG"

    ensure_tag_does_not_exist

    if ! confirm_release; then
        info "Aborted. No tag was created or pushed."
        exit 0
    fi

    create_and_push_tag
}

main "$@"
