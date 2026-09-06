package fixture.accessors;

// Exercises the accessor filter for `hasNext` paired with `toArray`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class PreHasNext {

    private Shape2 probe;

    public void holds1() {
        probe.hasNext();
        probe.toArray();
    }

    public void holds2() {
        probe.hasNext();
        probe.toArray();
    }

    public void holds3() {
        probe.hasNext();
        probe.toArray();
    }

    public void holds4() {
        probe.hasNext();
        probe.toArray();
    }

    public void deviates() {
        probe.hasNext();
    }
}
