package fixture.accessors;

// Exercises the accessor filter for `endsWith` paired with `equals`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccEndsWith {

    private Probe11 probe;

    public void holds1() {
        probe.endsWith();
        probe.equals();
    }

    public void holds2() {
        probe.endsWith();
        probe.equals();
    }

    public void holds3() {
        probe.endsWith();
        probe.equals();
    }

    public void holds4() {
        probe.endsWith();
        probe.equals();
    }

    public void deviates() {
        probe.endsWith();
    }
}
