using NUnit.Framework;
using Orders.Domain;

public class OrderTests
{
    [Test]
    public void TotalsLines() =>
        Assert.That(new Order([new(2m, 3), new(1m, 1)]).Total(), Is.EqualTo(7m));

    [Test, Category("Integration")]
    public void SavesToDatabase() => Assert.Ignore("Needs SQL Server.");
}
