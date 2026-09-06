package fixture.accessors;

// Exercises the accessor filter for `toArray` paired with `asList`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class PreToArray {

    private Shape3 probe;

    public void holds1() {
        probe.toArray();
        probe.asList();
    }

    public void holds2() {
        probe.toArray();
        probe.asList();
    }

    public void holds3() {
        probe.toArray();
        probe.asList();
    }

    public void holds4() {
        probe.toArray();
        probe.asList();
    }

    public void deviates() {
        probe.toArray();
    }
}
