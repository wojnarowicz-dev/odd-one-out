package fixture.accessors;

// Exercises the accessor filter for `count` paired with `charAt`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccCount {

    private Probe2 probe;

    public void holds1() {
        probe.count();
        probe.charAt();
    }

    public void holds2() {
        probe.count();
        probe.charAt();
    }

    public void holds3() {
        probe.count();
        probe.charAt();
    }

    public void holds4() {
        probe.count();
        probe.charAt();
    }

    public void deviates() {
        probe.count();
    }
}
