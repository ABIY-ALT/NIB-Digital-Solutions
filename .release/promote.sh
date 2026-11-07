#!/bin/sh
#
# Promote this pipeline's candidate images to approved release images.
#
# Run by promote_images in .gitlab-ci.yml, on pushes to dev and staging
# only, once every gate has passed. Nothing else writes the release tags
# (:<commit sha>, :dev, :staging) of devops/appcore/backend,
# backend-migrate and frontend.
#
#   1. Evidence. Each gate wrote evidence/<job>.env as its last step, so
#      the file exists only if the gate passed. Each must name this commit
#      and this pipeline, and each gate that ran images must name the
#      exact candidate digests the build jobs pushed.
#   2. Candidates. Each must be in the registry under that digest, with
#      the commit and pipeline labels its build job gave it.
#   3. Copy. Each candidate is copied by digest, with no rebuild and no
#      pull, to :<commit sha> and then to :<branch>. regctl copies the
#      manifest unchanged, so the release digest is the candidate digest;
#      every copy is read back to check it.
#   4. Record. release/release-manifest.json (for people and tools) and
#      release/release.env (read by deploy_staging) name the approved
#      digests.
#
# It stops at the first problem. A problem with the evidence or the
# candidates stops it before anything is copied. The required gates are
# listed here rather than in a variable, so no CI/CD variable can change
# them.
#
# Needs regctl, and the GitLab predefined variables checked below.

# shellcheck disable=SC2154 # the CI_* variables come from GitLab

set -eu

# Every gate a release needs, by job name. promote_images' needs: in
# .gitlab-ci.yml lists the same jobs. A gate missing from needs: has no
# evidence here, and the promotion fails.
GATES="lint test_backend test_frontend test_tools sonarqube_check migration_check security_report_gate dependency_scan container_scan snyk_dependency_scan snyk_container_scan"

# The images, in the order they are promoted.
IMAGES="backend backend-migrate frontend"

# The label the build jobs set to their pipeline ID. A branch tag never
# moves back to the build of an older pipeline.
PIPELINE_LABEL="et.com.nibbank.ci.pipeline-id"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

for name in CI_REGISTRY CI_REGISTRY_USER CI_REGISTRY_PASSWORD CI_PROJECT_DIR \
  CI_PROJECT_PATH CI_COMMIT_SHA CI_PIPELINE_ID CI_PIPELINE_SOURCE \
  CI_PIPELINE_URL CI_JOB_ID; do
  eval "set_to=\${$name:-}"
  [ -n "$set_to" ] || fail "$name is not set. This script runs in GitLab CI only."
done

# Releases come from branch pipelines on dev and staging, nothing else.
# The job's rules say the same; this holds even if they change.
[ "$CI_PIPELINE_SOURCE" = push ] ||
  fail "only push pipelines promote, not $CI_PIPELINE_SOURCE pipelines."

BRANCH=${CI_COMMIT_BRANCH:-}

case "$BRANCH" in
  dev | staging) ;;
  *) fail "only dev and staging promote, not '${BRANCH:-(no branch)}'." ;;
esac

RELEASES="$CI_REGISTRY/devops/appcore"
CANDIDATES="$RELEASES/candidates"
EVIDENCE="$CI_PROJECT_DIR/evidence"
RELEASE="$CI_PROJECT_DIR/release"

# field <file> <key>: the value of <key> in an evidence file.
field() {
  sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1
}

is_digest() {
  printf '%s\n' "$1" | grep -Eq '^sha256:[0-9a-f]{64}$'
}

# candidate_digest <image>: the digest its build job pushed.
candidate_digest() {
  case "$1" in
    backend | backend-migrate) field "$EVIDENCE/build_backend_image.env" "$1" ;;
    frontend) field "$EVIDENCE/build_frontend_image.env" "$1" ;;
  esac
}

# check_evidence <job>: the job passed, in this pipeline, for this commit.
check_evidence() {
  file="$EVIDENCE/$1.env"

  [ -f "$file" ] ||
    fail "no evidence from $1 (evidence/$1.env). It must run and pass in" \
      "this pipeline, be listed in promote_images' needs, and end with" \
      ".record_evidence."

  for check in "job=$1" "commit=$CI_COMMIT_SHA" "pipeline=$CI_PIPELINE_ID" "result=passed"; do
    key=${check%%=*}
    expected=${check#*=}
    actual=$(field "$file" "$key")

    [ "$actual" = "$expected" ] ||
      fail "evidence/$1.env has $key=${actual:-(missing)}, expected $expected."
  done

  job_id=$(field "$file" job_id)

  case "$job_id" in
    '' | *[!0-9]*) fail "evidence/$1.env has no job ID." ;;
  esac

  echo "  $1: passed in job $job_id"
}

# check_images <gate> <image>...: the gate ran exactly these candidates.
check_images() {
  gate=$1
  shift

  for image in "$@"; do
    validated=$(field "$EVIDENCE/$gate.env" "$image")
    expected=$(candidate_digest "$image")

    [ "$validated" = "$expected" ] ||
      fail "$gate validated $image ${validated:-(nothing)}, but the build" \
        "job pushed $expected. Was a build job retried after $gate ran?" \
        "Run a new pipeline."
  done

  echo "  $gate ran the candidates: $*"
}

# label <image reference> <label>: a label of the image.
label() {
  regctl image config "$1" --format "{{ index .Config.Labels \"$2\" }}"
}

# copy <source> <target> <digest>: copy one image, then check that the
# target holds exactly that digest.
copy() {
  regctl image copy "$1" "$2" > /dev/null ||
    fail "could not copy $1 to $2."

  copied=$(regctl image digest "$2") ||
    fail "could not read $2 back after the copy."

  [ "$copied" = "$3" ] ||
    fail "$2 holds $copied after the copy, not $3. Something else wrote" \
      "it; retry promote_images."

  echo "  $2"
}

echo "=========================================="
echo "Promoting commit $CI_COMMIT_SHA"
echo "Pipeline $CI_PIPELINE_ID, branch $BRANCH"
echo "=========================================="

# ------------------------------------------------------------------
# 1. Evidence
# ------------------------------------------------------------------

echo "Evidence of every gate:"

for job in build_backend_image build_frontend_image $GATES; do
  check_evidence "$job"
done

for image in $IMAGES; do
  digest=$(candidate_digest "$image")

  is_digest "$digest" ||
    fail "the build job recorded no valid digest for $image (${digest:-nothing})."
done

check_images migration_check backend-migrate
check_images container_scan backend backend-migrate frontend
check_images snyk_container_scan backend backend-migrate frontend

# ------------------------------------------------------------------
# 2. Candidates
# ------------------------------------------------------------------

echo "Logging in to $CI_REGISTRY..."

printf '%s' "$CI_REGISTRY_PASSWORD" |
  regctl registry login "$CI_REGISTRY" -u "$CI_REGISTRY_USER" --pass-stdin

trap 'regctl registry logout "$CI_REGISTRY" > /dev/null 2>&1 || true' EXIT

echo "Candidates in the registry:"

for image in $IMAGES; do
  digest=$(candidate_digest "$image")
  ref="$CANDIDATES/$image@$digest"

  found=$(regctl image digest "$ref") ||
    fail "$ref is not in the registry."

  [ "$found" = "$digest" ] ||
    fail "$ref resolves to $found."

  revision=$(label "$ref" org.opencontainers.image.revision) ||
    fail "could not read the labels of $ref."

  built_by=$(label "$ref" "$PIPELINE_LABEL") ||
    fail "could not read the labels of $ref."

  [ "$revision" = "$CI_COMMIT_SHA" ] ||
    fail "$ref was built from commit ${revision:-(no label)}, not $CI_COMMIT_SHA."

  [ "$built_by" = "$CI_PIPELINE_ID" ] ||
    fail "$ref was built by pipeline ${built_by:-(no label)}, not $CI_PIPELINE_ID."

  echo "  $image: $digest"
done

# ------------------------------------------------------------------
# 3. Copy
# ------------------------------------------------------------------

echo "Publishing :$CI_COMMIT_SHA..."

for image in $IMAGES; do
  digest=$(candidate_digest "$image")
  copy "$CANDIDATES/$image@$digest" "$RELEASES/$image:$CI_COMMIT_SHA" "$digest"
done

echo "Moving :$BRANCH..."

moved=""

for image in $IMAGES; do
  digest=$(candidate_digest "$image")
  target="$RELEASES/$image:$BRANCH"

  # Never move a branch tag back. When a newer pipeline has already
  # promoted, its release keeps the tag; this one stays published under
  # its commit SHA, and deploy_staging deploys by digest either way.
  if regctl image digest "$target" > /dev/null 2>&1; then
    holder=$(label "$target" "$PIPELINE_LABEL") ||
      fail "could not read the labels of $target."

    case "$holder" in
      '' | *[!0-9]*) holder=0 ;;
    esac

    if [ "$holder" -gt "$CI_PIPELINE_ID" ]; then
      echo "  $target: kept on the release of pipeline $holder, which is newer."
      continue
    fi
  fi

  copy "$RELEASES/$image@$digest" "$target" "$digest"
  moved="$moved $image"
done

# ------------------------------------------------------------------
# 4. Record
# ------------------------------------------------------------------

BACKEND_DIGEST=$(candidate_digest backend)
MIGRATE_DIGEST=$(candidate_digest backend-migrate)
FRONTEND_DIGEST=$(candidate_digest frontend)

mkdir -p "$RELEASE"

cat > "$RELEASE/release.env" <<EOF
RELEASE_COMMIT=$CI_COMMIT_SHA
RELEASE_PIPELINE=$CI_PIPELINE_ID
RELEASE_BRANCH=$BRANCH
RELEASE_BACKEND_DIGEST=$BACKEND_DIGEST
RELEASE_MIGRATE_DIGEST=$MIGRATE_DIGEST
RELEASE_FRONTEND_DIGEST=$FRONTEND_DIGEST
EOF

# tags <image>: the release tags this run wrote, as a JSON array.
tags() {
  case " $moved " in
    *" $1 "*) printf '["%s", "%s"]' "$CI_COMMIT_SHA" "$BRANCH" ;;
    *) printf '["%s"]' "$CI_COMMIT_SHA" ;;
  esac
}

# image_entry <image> <digest> <separator>
image_entry() {
  cat <<EOF
    "$1": {
      "repository": "$RELEASES/$1",
      "digest": "$2",
      "reference": "$RELEASES/$1@$2",
      "tags": $(tags "$1"),
      "candidate": "$CANDIDATES/$1@$2"
    }$3
EOF
}

{
  cat <<EOF
{
  "schemaVersion": 1,
  "project": "$CI_PROJECT_PATH",
  "commit": "$CI_COMMIT_SHA",
  "branch": "$BRANCH",
  "pipeline": { "id": $CI_PIPELINE_ID, "url": "$CI_PIPELINE_URL" },
  "promotion": { "jobId": $CI_JOB_ID, "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
  "images": {
EOF
  image_entry backend "$BACKEND_DIGEST" ,
  image_entry backend-migrate "$MIGRATE_DIGEST" ,
  image_entry frontend "$FRONTEND_DIGEST" ""
  echo '  },'
  echo '  "validation": ['

  for job in build_backend_image build_frontend_image $GATES; do
    printf '    { "job": "%s", "jobId": %s },\n' "$job" "$(field "$EVIDENCE/$job.env" job_id)"
  done | sed '$ s/,$//'

  echo '  ]'
  echo '}'
} > "$RELEASE/release-manifest.json"

echo "=========================================="
echo "Release manifest (release/release-manifest.json):"
echo "=========================================="

cat "$RELEASE/release-manifest.json"
