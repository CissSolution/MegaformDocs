# MegaForm.Integrations.CloudStorage

Optional cloud storage providers for MegaForm. Ships with an Amazon S3 provider (`AmazonS3StorageProvider`) implementing `MegaForm.Core.Integrations.Storage.IStorageProvider`.

This package is referenced automatically by `MegaForm.AspNetCore.Component` and `MegaForm.Web`. It is kept separate from `MegaForm.Core` so the core engine does not carry heavy cloud SDK dependencies.
