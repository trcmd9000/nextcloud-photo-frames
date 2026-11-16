# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Clock style option per frame: the separator dot can either flip every second (previous behavior) or a static 24-hour `HH:MM` can be shown.
- Clock size slider per frame (50–300 % of the previous size).
- Optional `w` and `h` query parameters on the frame image endpoint (clamped to 64–2560). The frame page requests an image sized to the screen (including device pixel ratio) and the server delivers a cover-fitted resize, which lowers memory use on devices with little RAM.

### Changed

- The frame page shows images via blob URLs instead of data URLs and releases the memory of replaced images and canvas buffers.
