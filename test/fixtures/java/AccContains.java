package fixture.accessors;

// Exercises the accessor filter for `contains` paired with `containsKey`.
// Four units hold the pair and one deviates, so without the filter this file
// would produce a finding. With the filter it is silent. Any mutant that
// breaks the filter — or drops either name from the list — makes it speak,
// and the golden test fails.
public class AccContains {

    private Probe7 probe;

    public void holds1() {
        probe.contains();
        probe.containsKey();
    }

    public void holds2() {
        probe.contains();
        probe.containsKey();
    }

    public void holds3() {
        probe.contains();
        probe.containsKey();
    }

    public void holds4() {
        probe.contains();
        probe.containsKey();
    }

    public void deviates() {
        probe.contains();
    }
}
