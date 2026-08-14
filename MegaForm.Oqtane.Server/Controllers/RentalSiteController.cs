using System;
using System.Collections.Generic;
using System.Data;
using MegaForm.Oqtane.Server.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Oqtane.Controllers;
using Oqtane.Infrastructure;

namespace MegaForm.Oqtane.Server.Controllers
{
    [Route("api/MegaForm/[controller]")]
    public class RentalSiteController : ModuleControllerBase
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        public RentalSiteController(
            IDbContextFactory<MegaFormDbContext> dbContextFactory,
            ILogManager logger,
            IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _dbContextFactory = dbContextFactory;
        }

        [HttpGet("Listings")]
        public IActionResult Listings()
        {
            try
            {
                using var db = _dbContextFactory.CreateDbContext();
                var conn = db.Database.GetDbConnection();
                if (conn.State != ConnectionState.Open) conn.Open();

                if (!TableExists(conn, "MF_RentalBuildings") || !TableExists(conn, "MF_RentalRooms"))
                {
                    return Ok(new RentalListingsResponse());
                }

                var buildings = new List<RentalBuildingDto>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
SELECT BuildingCode, Name, District, Address, PhotoUrl, TotalRooms, OccupiedRooms, AvgRent
FROM MF_RentalBuildings
ORDER BY BuildingCode";
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        buildings.Add(new RentalBuildingDto
                        {
                            BuildingCode = ReadString(r, 0),
                            Name = ReadString(r, 1),
                            District = ReadString(r, 2),
                            Address = ReadString(r, 3),
                            PhotoUrl = ReadString(r, 4),
                            TotalRooms = ReadInt(r, 5),
                            OccupiedRooms = ReadInt(r, 6),
                            AvgRent = ReadDecimal(r, 7)
                        });
                    }
                }

                var rooms = new List<RentalRoomDto>();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
SELECT RoomCode, BuildingCode, RoomName, FloorLevel, AreaM2, FinalPrice, DiscountPercent, Status, StatusLabel, PhotoUrl, AmenitiesText
FROM MF_RentalRooms
ORDER BY BuildingCode, RoomCode";
                    using var r = cmd.ExecuteReader();
                    while (r.Read())
                    {
                        rooms.Add(new RentalRoomDto
                        {
                            RoomCode = ReadString(r, 0),
                            BuildingCode = ReadString(r, 1),
                            RoomName = ReadString(r, 2),
                            FloorLevel = ReadInt(r, 3),
                            AreaM2 = ReadDecimal(r, 4),
                            FinalPrice = ReadDecimal(r, 5),
                            DiscountPercent = ReadInt(r, 6),
                            Status = ReadString(r, 7),
                            StatusLabel = ReadString(r, 8),
                            PhotoUrl = ReadString(r, 9),
                            AmenitiesText = ReadString(r, 10)
                        });
                    }
                }

                var occupied = 0;
                var revenue = 0m;
                var discountRooms = 0;
                var available = 0;
                var rentSum = 0m;
                foreach (var room in rooms)
                {
                    rentSum += room.FinalPrice;
                    if (room.Status == "available") available++;
                    if (room.Status == "occupied" || room.Status == "reserved")
                    {
                        occupied++;
                        revenue += room.FinalPrice;
                    }
                    if (room.DiscountPercent >= 20) discountRooms++;
                }

                return Ok(new RentalListingsResponse
                {
                    Buildings = buildings,
                    Rooms = rooms,
                    Stats = new RentalStatsDto
                    {
                        Buildings = buildings.Count,
                        Rooms = rooms.Count,
                        AvailableRooms = available,
                        DiscountRooms = discountRooms,
                        AvgRent = rooms.Count == 0 ? 0 : Math.Round(rentSum / rooms.Count, 0),
                        OccupancyPercent = rooms.Count == 0 ? 0 : Math.Round(occupied * 100m / rooms.Count, 1),
                        MonthlyRevenue = revenue
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private static bool TableExists(IDbConnection conn, string tableName)
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT CASE WHEN OBJECT_ID(@name, 'U') IS NULL THEN 0 ELSE 1 END";
            var p = cmd.CreateParameter();
            p.ParameterName = "@name";
            p.Value = "dbo." + tableName;
            cmd.Parameters.Add(p);
            return Convert.ToInt32(cmd.ExecuteScalar()) == 1;
        }

        private static string ReadString(IDataRecord r, int index) => r.IsDBNull(index) ? string.Empty : Convert.ToString(r.GetValue(index)) ?? string.Empty;
        private static int ReadInt(IDataRecord r, int index) => r.IsDBNull(index) ? 0 : Convert.ToInt32(r.GetValue(index));
        private static decimal ReadDecimal(IDataRecord r, int index) => r.IsDBNull(index) ? 0 : Convert.ToDecimal(r.GetValue(index));

        public sealed class RentalListingsResponse
        {
            public List<RentalBuildingDto> Buildings { get; set; } = new();
            public List<RentalRoomDto> Rooms { get; set; } = new();
            public RentalStatsDto Stats { get; set; } = new();
        }

        public sealed class RentalStatsDto
        {
            public int Buildings { get; set; }
            public int Rooms { get; set; }
            public int AvailableRooms { get; set; }
            public int DiscountRooms { get; set; }
            public decimal AvgRent { get; set; }
            public decimal OccupancyPercent { get; set; }
            public decimal MonthlyRevenue { get; set; }
        }

        public sealed class RentalBuildingDto
        {
            public string BuildingCode { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public string District { get; set; } = string.Empty;
            public string Address { get; set; } = string.Empty;
            public string PhotoUrl { get; set; } = string.Empty;
            public int TotalRooms { get; set; }
            public int OccupiedRooms { get; set; }
            public decimal AvgRent { get; set; }
        }

        public sealed class RentalRoomDto
        {
            public string RoomCode { get; set; } = string.Empty;
            public string BuildingCode { get; set; } = string.Empty;
            public string RoomName { get; set; } = string.Empty;
            public int FloorLevel { get; set; }
            public decimal AreaM2 { get; set; }
            public decimal FinalPrice { get; set; }
            public int DiscountPercent { get; set; }
            public string Status { get; set; } = string.Empty;
            public string StatusLabel { get; set; } = string.Empty;
            public string PhotoUrl { get; set; } = string.Empty;
            public string AmenitiesText { get; set; } = string.Empty;
        }
    }
}
