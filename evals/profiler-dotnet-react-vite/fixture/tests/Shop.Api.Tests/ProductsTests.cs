using Microsoft.AspNetCore.Mvc.Testing;

public class ProductsTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task ListsProducts()
    {
        var body = await factory.CreateClient().GetStringAsync("/api/products");
        Assert.Contains("Tea", body);
    }
}
