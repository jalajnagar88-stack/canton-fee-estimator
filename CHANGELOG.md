# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Experimental support for estimating fees on multi-domain Canton topologies.
- `--json-output` flag for CLI to allow easier integration with other tools.

### Changed
- Updated internal fee constants to match latest Canton Enterprise release candidate.

## [0.2.0] - 2024-05-20

### Added
- **Web Interface**: A new web-based UI (`/web`) for interactive fee estimation and visualization, complementing the existing CLI tool.
- **Load Simulator**: The `simulate` command now allows replaying a transaction script against a local Canton DevNet to measure actual confirmation times and resource usage.
- Support for analyzing Daml projects using SDK 3.1.0.
- `docs/OPTIMISATION.md` with common patterns for reducing transaction costs in Daml.

### Changed
- **BREAKING**: The CLI command structure was reorganized. `estimate-dar` is now `estimate dar`.
- Fee estimation algorithm now more accurately models the cost of choice arguments and contract fetches.
- Improved error reporting for Daml script parsing failures.

## [0.1.1] - 2024-04-15

### Fixed
- Corrected a miscalculation in transaction payload sizing for contracts with large numbers of signatories.
- Fixed a bug where `daml test` scripts were being incorrectly analyzed, leading to inflated fee estimates.

### Changed
- Updated `docs/FEE_MODEL.md` to clarify how observer party costs are calculated.

## [0.1.0] - 2024-03-30

### Added
- Initial release of the Canton Fee Estimator CLI.
- `estimate dar` command to analyze a compiled `.dar` file and output transaction fee estimates for each choice.
- `estimate script` command to analyze a `Daml.Script` file for a total workflow cost.
- Basic fee model based on Canton protocol version 2.x.
- Project setup with `daml.yaml`, `.gitignore`, and a CI workflow in GitHub Actions.