var app = WebApplication.CreateBuilder(args).Build();
app.MapGet("/api/products", () => new[] { "Tea", "Coffee" });
app.Run();

public partial class Program;
