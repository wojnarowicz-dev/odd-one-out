package fixture.accessors;

// Exercises the accessor filter for `startsWith` paired with `endsWith`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccStartsWith {

    private Probe10 probe;

    public void holds1() {
        probe.startsWith();
        probe.endsWith();
    }

    public void holds2() {
        probe.startsWith();
        probe.endsWith();
    }

    public void holds3() {
        probe.startsWith();
        probe.endsWith();
    }

    public void holds4() {
        probe.startsWith();
        probe.endsWith();
    }

    public void deviates() {
        probe.startsWith();
    }
}
