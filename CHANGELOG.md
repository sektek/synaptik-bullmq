# Changelog

## [0.2.4](https://github.com/sektek/synaptik-bullmq/compare/v0.2.3...v0.2.4) (2026-11-07)

### Features

* **synaptik-bullmq:** add JobProvider to retrieve a job by id ([#16](https://github.com/sektek/synaptik-bullmq/issues/16)) ([a5cf4b6](https://github.com/sektek/synaptik-bullmq/commit/a5cf4b6949c10d8e0c58af552d40010cadfe584e))
* **synaptik-bullmq:** add RepeatableJobProvider to retrieve a repeatable job and its next run ([#17](https://github.com/sektek/synaptik-bullmq/issues/17)) ([590927a](https://github.com/sektek/synaptik-bullmq/commit/590927a967c1ed6fcda2726d9aeb152ada1a67c2))

## [0.2.3](https://github.com/sektek/synaptik-bullmq/compare/v0.2.2...v0.2.3) (2026-11-01)

### Bug Fixes

* **synaptik-bullmq:** apply workerOptions in BullMqGateway ([#13](https://github.com/sektek/synaptik-bullmq/issues/13)) ([38635a1](https://github.com/sektek/synaptik-bullmq/commit/38635a1d2799a8b1b4df5c73af4802c470f0b6bf))
* **synaptik-bullmq:** forward blockingConnection to the Worker ([#14](https://github.com/sektek/synaptik-bullmq/issues/14)) ([8593443](https://github.com/sektek/synaptik-bullmq/commit/85934435a1f18739624dda2a94ced3904168c13b))

## [0.2.2](https://github.com/sektek/synaptik-bullmq/compare/v0.2.1...v0.2.2) (2026-04-19)

### Bug Fixes

* Update to AbstractEventComponent (synaptik ^0.4.0) ([#9](https://github.com/sektek/synaptik-bullmq/issues/9)) ([c6d17a9](https://github.com/sektek/synaptik-bullmq/commit/c6d17a93b709edddeab944b2b6fe61b0d33b6ab4))

## [0.2.1](https://github.com/sektek/synaptik-bullmq/compare/v0.2.0...v0.2.1) (2026-03-22)

## 0.2.0 (2026-03-22)

### ⚠ BREAKING CHANGES

* Refactor error handling for consistency (#3)

### Features

* Implement BullMQ channel and gateway ([#1](https://github.com/sektek/synaptik-bullmq/issues/1)) ([d85ffdb](https://github.com/sektek/synaptik-bullmq/commit/d85ffdba19bdd0056afe7f66d30267c65b370a65))
* moved to c8 from nyc ([9537fa8](https://github.com/sektek/synaptik-bullmq/commit/9537fa8d5c1119ceda5ebb940396f894f4a52ba7))
* Refactor error handling for consistency ([#3](https://github.com/sektek/synaptik-bullmq/issues/3)) ([9f6701a](https://github.com/sektek/synaptik-bullmq/commit/9f6701ac6a7ec6063853c008cec236a8e26e2611))
* replace job-name-builder with job-name-provider for improved type definitions ([437c779](https://github.com/sektek/synaptik-bullmq/commit/437c779e1203875f8bd2ef35c1e00350ab54b5d3))
* support passing job options via channel send ([#2](https://github.com/sektek/synaptik-bullmq/issues/2)) ([6b307b1](https://github.com/sektek/synaptik-bullmq/commit/6b307b1925c495982c97e53e57d9606ca0b9e3d8))

### Bug Fixes

* Call to incorrect function ([b88e761](https://github.com/sektek/synaptik-bullmq/commit/b88e7611ea3349edddd462ce633fa5e3af6e1f99))
* renamed shutdown to stop for consitency ([2c2fd9e](https://github.com/sektek/synaptik-bullmq/commit/2c2fd9ed4051501c95ab45b42b34e0b8e8db56e0))
* Updated all calls to getComponent to use options instead of fallback ([3dc63b2](https://github.com/sektek/synaptik-bullmq/commit/3dc63b22bb42d0930832bcaa697abe2a7e3c870b))
* use reusable workflow for check in all workflows ([#6](https://github.com/sektek/synaptik-bullmq/issues/6)) ([2aa5299](https://github.com/sektek/synaptik-bullmq/commit/2aa529989e05fef4633adc605b007f45120cbdbe))
