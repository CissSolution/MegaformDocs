/*
  MegaForm SQL relationship and cascading-select demo
  Target: SQL Server 2016+

  This schema represents application-owned data. MegaForm reads the customer and
  order tables for dropdown options and writes a request row on submit. Foreign-key
  behavior remains a database responsibility.
*/

SET NOCOUNT ON;
GO
IF OBJECT_ID(N'dbo.MF_Demo_OrderRequests', N'U') IS NOT NULL
    DROP TABLE dbo.MF_Demo_OrderRequests;
IF OBJECT_ID(N'dbo.MF_Demo_Orders', N'U') IS NOT NULL
    DROP TABLE dbo.MF_Demo_Orders;
IF OBJECT_ID(N'dbo.MF_Demo_Customers', N'U') IS NOT NULL
    DROP TABLE dbo.MF_Demo_Customers;
GO

CREATE TABLE dbo.MF_Demo_Customers
(
    CustomerId   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MF_Demo_Customers PRIMARY KEY,
    CustomerCode NVARCHAR(32) NOT NULL CONSTRAINT UQ_MF_Demo_Customers_Code UNIQUE,
    CompanyName  NVARCHAR(200) NOT NULL,
    IsActive     BIT NOT NULL CONSTRAINT DF_MF_Demo_Customers_IsActive DEFAULT (1)
);

CREATE TABLE dbo.MF_Demo_Orders
(
    OrderId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MF_Demo_Orders PRIMARY KEY,
    CustomerId   INT NOT NULL,
    OrderNumber  NVARCHAR(32) NOT NULL CONSTRAINT UQ_MF_Demo_Orders_Number UNIQUE,
    OrderDate    DATE NOT NULL,
    Status       NVARCHAR(32) NOT NULL,
    CONSTRAINT FK_MF_Demo_Orders_Customers FOREIGN KEY (CustomerId)
        REFERENCES dbo.MF_Demo_Customers (CustomerId) ON DELETE CASCADE
);

CREATE TABLE dbo.MF_Demo_OrderRequests
(
    RequestId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MF_Demo_OrderRequests PRIMARY KEY,
    OrderId      INT NOT NULL,
    ContactEmail NVARCHAR(256) NOT NULL,
    RequestType  NVARCHAR(32) NOT NULL,
    Notes        NVARCHAR(MAX) NULL,
    CreatedUtc   DATETIME2(0) NOT NULL CONSTRAINT DF_MF_Demo_OrderRequests_CreatedUtc DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_MF_Demo_OrderRequests_Orders FOREIGN KEY (OrderId)
        REFERENCES dbo.MF_Demo_Orders (OrderId) ON DELETE CASCADE
);

CREATE INDEX IX_MF_Demo_Orders_CustomerId ON dbo.MF_Demo_Orders (CustomerId);
CREATE INDEX IX_MF_Demo_OrderRequests_OrderId ON dbo.MF_Demo_OrderRequests (OrderId);
GO

INSERT INTO dbo.MF_Demo_Customers (CustomerCode, CompanyName) VALUES
    (N'ACME-001', N'Acme Manufacturing'),
    (N'BRIGHT-002', N'Bright Retail Group'),
    (N'DELTA-003', N'Delta Foods');

INSERT INTO dbo.MF_Demo_Orders (CustomerId, OrderNumber, OrderDate, Status)
SELECT CustomerId, N'SO-2026-1001', '2026-09-01', N'Processing'
FROM dbo.MF_Demo_Customers WHERE CustomerCode = N'ACME-001'
UNION ALL
SELECT CustomerId, N'SO-2026-1002', '2026-09-08', N'Shipped'
FROM dbo.MF_Demo_Customers WHERE CustomerCode = N'ACME-001'
UNION ALL
SELECT CustomerId, N'SO-2026-2001', '2026-09-12', N'Processing'
FROM dbo.MF_Demo_Customers WHERE CustomerCode = N'BRIGHT-002';
GO
