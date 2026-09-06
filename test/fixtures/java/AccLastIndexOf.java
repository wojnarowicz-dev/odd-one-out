package fixture.accessors;

// Exercises the accessor filter for `lastIndexOf` paired with `contains`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccLastIndexOf {

    private Probe6 probe;

    public void holds1() {
        probe.lastIndexOf();
        probe.contains();
    }

    public void holds2() {
        probe.lastIndexOf();
        probe.contains();
    }

    public void holds3() {
        probe.lastIndexOf();
        probe.contains();
    }

    public void holds4() {
        probe.lastIndexOf();
        probe.contains();
    }

    public void deviates() {
        probe.lastIndexOf();
    }
}
