# Integrating Canton Fee Estimator into Your CI/CD Pipeline

Automating transaction fee analysis within your Continuous Integration (CI) pipeline is a powerful way to manage and control the operational costs of your Daml application on a Canton network. By integrating the `canton-fee-estimator`, you can:

-   **Prevent Cost Regressions:** Automatically detect when a code change unexpectedly increases transaction sizes and, therefore, costs.
-   **Enforce Budgets:** Fail builds that introduce changes exceeding a predefined cost threshold.
-   **Increase Developer Awareness:** Make transaction costs a visible and integral part of the development and review process.
-   **Inform Design Decisions:** Provide concrete data to guide optimizations in your Daml models *before* they reach production.

This guide provides practical steps for embedding fee analysis into your development workflow, with a primary focus on GitHub Actions.

## How It Works

The core CI workflow involves these steps:

1.  **Build:** Your Daml code is compiled into a Daml Application Archive (`.dar`) file.
2.  **Analyze:** The `canton-fee-estimator` CLI is run against the newly built `.dar` file to generate a fee report.
3.  **Compare (Optional but Recommended):** The new report is compared against a committed "baseline" report from your main branch.
4.  **Assert:** The CI job passes or fails based on the comparison results. If any transaction's cost has increased beyond a set threshold (e.g., 5%), the build fails.

## Example: GitHub Actions Integration

Here is a complete workflow for GitHub Actions that builds a Daml project, runs the fee estimator, and compares the results against a baseline.

Create a file named `.github/workflows/fee_check.yml` in your repository:

```yaml
name: Canton Fee Check

on:
  pull_request:
    branches:
      - main
      - develop
  push:
    branches:
      - main

jobs:
  fee-estimation:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          # Fetch depth 0 is required to get the base branch for comparison
          fetch-depth: 0

      - name: Install DPM
        run: curl https://get.digitalasset.com/install/install.sh | sh

      - name: Add DPM to PATH
        run: echo "$HOME/.dpm/bin" >> $GITHUB_PATH

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install Canton Fee Estimator CLI
        # In a real project, you would install your published package
        # For this example, we assume it's in the repo and build it.
        # Replace this with: npm install -g canton-fee-estimator
        run: |
          npm install --prefix ./cli
          npm link --prefix ./cli

      - name: Build Daml Project
        run: dpm build

      - name: Generate Fee Report for Current Branch
        id: generate_current
        run: |
          DAR_PATH=$(find .daml/dist -name "*.dar" | head -n 1)
          echo "Analyzing DAR: $DAR_PATH"
          canton-fee-estimator batch-analyze --dar "$DAR_PATH" --output fee-report-current.json
        
      - name: Checkout Base Branch and Generate Baseline
        # We checkout the base branch (e.g., 'main') to generate a fresh baseline
        # This ensures we are always comparing against the latest committed version
        id: generate_baseline
        run: |
          # Get the base branch name (e.g., main)
          BASE_REF=$(jq -r .pull_request.base.ref "$GITHUB_EVENT_PATH")
          git checkout $BASE_REF
          
          # Rebuild and re-analyze on the base branch
          dpm build
          DAR_PATH_BASE=$(find .daml/dist -name "*.dar" | head -n 1)
          echo "Analyzing baseline DAR: $DAR_PATH_BASE"
          canton-fee-estimator batch-analyze --dar "$DAR_PATH_BASE" --output fee-report-baseline.json
          
      - name: Compare Fee Reports
        run: |
          echo "Comparing current report against baseline..."
          canton-fee-estimator compare \
            --baseline fee-report-baseline.json \
            --current fee-report-current.json \
            --threshold 5 # Fail if any transaction cost increases by more than 5%
```

### Explanation of the Workflow

1.  **Checkout:** Checks out the code. `fetch-depth: 0` is crucial for allowing `git` to check out the base branch later.
2.  **Install Tooling:** Installs DPM, Node.js, and the `canton-fee-estimator` CLI.
3.  **Build Daml Project:** Runs `dpm build` to create the `.dar` file for the current branch (e.g., a feature branch in a PR).
4.  **Generate Current Report:** Runs `batch-analyze` on the new `.dar` to create `fee-report-current.json`.
5.  **Generate Baseline Report:** This is the key step for accurate comparisons. It checks out the *base branch* of the pull request (e.g., `main`), rebuilds the project from that state, and runs `batch-analyze` to create `fee-report-baseline.json`. This avoids relying on a stale, committed baseline file.
6.  **Compare Reports:** Runs the `compare` command. It will exit with a non-zero status code if the `--threshold 5` condition is violated, causing the entire CI job to fail. This immediately alerts the developer that their change has a significant cost impact.

## Integration with Other CI Systems (Jenkins, GitLab, etc.)

The logic from the GitHub Actions example can be adapted to any CI system that can execute shell scripts. The essential commands are:

```bash
# 1. Ensure DPM and Node.js are available in your CI environment
#    (Refer to your CI system's documentation for installing dependencies)

# 2. Install the estimator
npm install -g canton-fee-estimator

# 3. Build your Daml project to get the .dar file
dpm build
DAR_PATH_CURRENT=$(find .daml/dist -name "*.dar" | head -n 1)

# 4. Generate the current fee report
canton-fee-estimator batch-analyze --dar "$DAR_PATH_CURRENT" --output fee-report-current.json

# 5. Get the baseline report (strategy may vary)
#    - You could check out the main branch and rebuild as in the GitHub example.
#    - Or you could download it as a build artifact from your last successful `main` branch build.
#    For this example, let's assume `fee-report-baseline.json` is available.

# 6. Run the comparison
canton-fee-estimator compare \
  --baseline fee-report-baseline.json \
  --current fee-report-current.json \
  --threshold 5

# The command will fail (exit > 0) if the threshold is breached,
# which should automatically fail your CI stage.
```

## Advanced: Pull Request Commenting

For a more integrated developer experience, you can configure your CI to post the results of the fee analysis as a comment on the pull request. This provides immediate, actionable feedback directly within the code review context.

This typically involves:

1.  Running the `compare` command with a `--format json` or similar flag to get structured output.
2.  Using a script (e.g., with `actions/github-script` in GitHub Actions) to parse the JSON.
3.  Formatting the output into a human-readable Markdown table.
4.  Using the platform's API (e.g., the GitHub API) to post the comment.

### Example Snippet for GitHub Actions PR Commenting

```yaml
# Add this step after the 'Compare Fee Reports' step

- name: Format Fee Report for PR Comment
  id: format_comment
  run: |
    # Run compare again, but capture JSON output. Allow failure so this step always runs.
    JSON_OUTPUT=$(canton-fee-estimator compare \
      --baseline fee-report-baseline.json \
      --current fee-report-current.json \
      --threshold 5 --format json || true)
      
    # Use a tool like 'jq' to format this into a Markdown table
    # This is a simplified example. A real script would be more robust.
    COMMENT_BODY=$(echo "$JSON_OUTPUT" | jq -r '...')
    echo "comment_body=$COMMENT_BODY" >> $GITHUB_OUTPUT

- name: Post Fee Report to PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v6
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `## Canton Fee Analysis\n\n${{ steps.format_comment.outputs.comment_body }}`
      })
```