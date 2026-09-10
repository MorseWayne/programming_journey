#!/usr/bin/env bash

set -Eeuo pipefail

DATA_DIR="${DEEPTUTOR_DATA_DIR:-/srv/deeptutor/data}"
NOTEBOOK_DIR="$DATA_DIR/user/workspace/notebook"
MASTERY_DB="$DATA_DIR/user/workspace/learning/mastery/mastery.sqlite3"
SNAPSHOT_DIR=""
SNAPSHOT_DB=""

usage() {
    cat <<'EOF'
用法：
  inspect.sh notes [主题正则]
  inspect.sh note <notebook-id> <record-id>
  inspect.sh note-hash <notebook-id> <record-id>
  inspect.sh routes [主题正则]
  inspect.sh route <path-id>

脚本只读取 DeepTutor 数据。DEEPTUTOR_DATA_DIR 默认是 /srv/deeptutor/data。
EOF
}

die() {
    echo "错误：$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "找不到必要命令：$1"
}

validate_id() {
    [[ "$1" =~ ^[A-Za-z0-9_.:-]+$ ]] || die "标识符不合法：$1"
}

cleanup() {
    if [[ -n "$SNAPSHOT_DIR" && -d "$SNAPSHOT_DIR" ]]; then
        local snapshot_file
        for snapshot_file in \
            "$SNAPSHOT_DIR/mastery.sqlite3" \
            "$SNAPSHOT_DIR/mastery.sqlite3-wal" \
            "$SNAPSHOT_DIR/mastery.sqlite3-shm"
        do
            [[ ! -e "$snapshot_file" ]] || rm -f -- "$snapshot_file"
        done
        rmdir -- "$SNAPSHOT_DIR"
    fi
}
trap cleanup EXIT

notebook_file() {
    local notebook_id="$1"
    validate_id "$notebook_id"
    local path="$NOTEBOOK_DIR/$notebook_id.json"
    [[ -f "$path" ]] || die "找不到 Notebook：$notebook_id"
    printf '%s' "$path"
}

snapshot_mastery_db() {
    require_command sqlite3
    [[ -f "$MASTERY_DB" ]] || die "找不到精通之路数据库：$MASTERY_DB"

    SNAPSHOT_DIR="$(mktemp -d)"
    SNAPSHOT_DB="$SNAPSHOT_DIR/mastery.sqlite3"
    cp -- "$MASTERY_DB" "$SNAPSHOT_DB"
    if [[ -f "$MASTERY_DB-wal" ]]; then
        cp -- "$MASTERY_DB-wal" "$SNAPSHOT_DB-wal"
    fi
    if [[ -f "$MASTERY_DB-shm" ]]; then
        cp -- "$MASTERY_DB-shm" "$SNAPSHOT_DB-shm"
    fi
}

list_notes() {
    local topic="${1:-}"
    [[ -d "$NOTEBOOK_DIR" ]] || die "找不到 Notebook 目录：$NOTEBOOK_DIR"

    shopt -s nullglob
    local files=("$NOTEBOOK_DIR"/*.json)
    (( ${#files[@]} > 0 )) || die "Notebook 目录中没有 JSON 文件：$NOTEBOOK_DIR"

    printf 'NOTEBOOK_ID\tRECORD_ID\tTYPE\tTITLE\tCREATED_AT\tOUTPUT_CHARS\n'
    local file notebook_id
    for file in "${files[@]}"; do
        notebook_id="$(basename -- "$file" .json)"
        jq -r --arg topic "$topic" --arg notebook_id "$notebook_id" '
            .records[]?
            | select(
                $topic == ""
                or ([.title // "", .summary // ""] | join("\n") | test($topic; "i"))
            )
            | [
                $notebook_id,
                .id,
                .type,
                .title,
                (.created_at | tostring),
                ((.output // "") | length | tostring)
            ]
            | @tsv
        ' "$file"
    done
}

read_note() {
    local notebook_id="$1"
    local record_id="$2"
    validate_id "$record_id"
    local file
    file="$(notebook_file "$notebook_id")"
    jq -e -r --arg record_id "$record_id" '
        first(.records[]? | select(.id == $record_id)) as $record
        | if $record == null then
            error("找不到 Notebook record：" + $record_id)
          else
            $record.output
          end
    ' "$file"
}

hash_note() {
    require_command sha256sum
    local notebook_id="$1"
    local record_id="$2"
    validate_id "$record_id"
    local file
    file="$(notebook_file "$notebook_id")"
    jq -e -j --arg record_id "$record_id" '
        first(.records[]? | select(.id == $record_id)) as $record
        | if $record == null then
            error("找不到 Notebook record：" + $record_id)
          else
            $record.output
          end
    ' "$file" | sha256sum | awk '{print $1}'
}

list_routes() {
    local topic="${1:-}"
    snapshot_mastery_db
    sqlite3 -readonly "$SNAPSHOT_DB" \
        'select state_json from mastery_paths order by updated_at desc;' \
        | jq -rs --arg topic "$topic" '
            .[]
            | ([
                .name // "",
                .book_id // "",
                (.modules[]? | .name // ""),
                (.modules[]?.knowledge_points[]? | .name // "")
              ] | join("\n")) as $search_text
            | select($topic == "" or ($search_text | test($topic; "i")))
            | "PATH\t\(.book_id)\tUPDATED_AT\t\(.updated_at)\n"
              + ([
                    (.modules | sort_by(.order)[]
                    | "MODULE\t\(.order)\t\(.name)\n"
                      + ([
                            (.knowledge_points | to_entries[]
                            | "KP\t\(.key)\t\(.value.name)\t\(.value.type)")
                         ] | join("\n")))
                 ] | join("\n"))
        '
}

read_route() {
    local path_id="$1"
    validate_id "$path_id"
    snapshot_mastery_db
    sqlite3 -readonly "$SNAPSHOT_DB" \
        "select state_json from mastery_paths where path_id='$path_id';" \
        | jq -s --arg path_id "$path_id" '
            if length == 0 then
                error("找不到 Mastery Path：" + $path_id)
            else
                .[0]
                | {
                    name,
                    book_id,
                    updated_at,
                    learner_profile,
                    modules: (
                        .modules
                        | sort_by(.order)
                        | map({id, name, order, objective, knowledge_points})
                    )
                  }
            end
        '
}

require_command jq

command_name="${1:-}"
case "$command_name" in
    notes)
        list_notes "${2:-}"
        ;;
    note)
        (( $# == 3 )) || { usage >&2; exit 2; }
        read_note "$2" "$3"
        ;;
    note-hash)
        (( $# == 3 )) || { usage >&2; exit 2; }
        hash_note "$2" "$3"
        ;;
    routes)
        list_routes "${2:-}"
        ;;
    route)
        (( $# == 2 )) || { usage >&2; exit 2; }
        read_route "$2"
        ;;
    help|-h|--help)
        usage
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac
