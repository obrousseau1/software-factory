using Orders.Domain;

var app = WebApplication.CreateBuilder(args).Build();
app.MapPost("/orders", (Order order) => Results.Ok(order.Total()));
app.Run();
