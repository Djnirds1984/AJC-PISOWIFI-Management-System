# Changelog

All notable changes to the AJC PISOWIFI Management System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Enhanced system backup functionality with comprehensive .nxs files
- Real-time backup preview and validation in updater interface
- Detailed backup metadata including hardware ID and license status
- Database export/import capabilities for complete system migration
- Progress indicators and improved UX for backup/restore operations

### Changed
- Refactored SystemUpdater component with modern UI design
- Improved backup file structure with metadata.json, database.sql, and config files
- Enhanced restore process with validation and selective file restoration
- Better error handling and user feedback throughout backup/restore workflows

### Fixed
- Backup file naming and content-disposition headers
- Restore process now properly handles configuration file conflicts
- Database import/export functionality for cross-platform compatibility
- Removed adm-zip frontend dependency that caused build errors
- Fixed esbuild bundling issues with Node.js built-in modules

### Security
- Enhanced backup file validation and integrity checking
- Improved authentication handling for backup/restore operations 

## [3.5.0-beta.1] - 2026-02-02

### Added
- Firmware download button in Hardware tab
- Speedtest utility in Admin panel
- Enhanced NodeMCU ESP8266 firmware support
- Improved hardware abstraction layer
- Multi-role dashboard support

### Changed
- Updated project version to v3.5.0-beta.1
- Fixed install.sh package installation syntax
- Improved UI component organization
- Enhanced admin panel navigation

### Fixed
- Resolved APT package resolution issues in install.sh
- Fixed firmware download authorization headers
- Corrected version display in admin panel
- Resolved package-lock.json version inconsistencies

### Security
- Enhanced authentication token handling
- Improved API security measures

## [3.4.0-beta.1] - 2026-01-15

### Added
- Initial beta release
- Core PisoWiFi management functionality
- Admin dashboard with analytics
- Hardware integration support
- License management system
- Multi-coinslot support

### Changed
- Initial project structure and architecture
- Database schema implementation
- API endpoint organization

[3.5.0-beta.1]: https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System/releases/tag/v3.5.0-beta.1
[3.4.0-beta.1]: https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System/releases/tag/v3.4.0-beta.1