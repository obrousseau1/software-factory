namespace Orders.Domain;

public record Line(decimal Price, int Quantity);

public record Order(IReadOnlyList<Line> Lines)
{
    public decimal Total() => Lines.Sum(l => l.Price * l.Quantity);
}
